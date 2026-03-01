import { logger } from './core/logger.js';
import { config } from './core/config.js';
import { WhatsAppTransport } from './transport/whatsapp.js';
import { TelegramTransport } from './transport/telegram.js';
import { AccessController } from './access/controller.js';
import type { SessionState } from './access/controller.js';
import { CommandRouter } from './router/index.js';
import { OpenCodeAdapter } from './adapter/opencode.js';
import { SafetyEngine } from './safety/engine.js';
import { CommandExecutor } from './commands/executor.js';
import { MessageFormatter } from './presentation/formatter.js';
import { LocalStore } from './storage/sqlite.js';
import { randomUUID } from 'node:crypto';

interface IncomingMessageEvent {
  channel?: 'whatsapp' | 'telegram';
  from?: string;
  body?: string;
  messageId?: string;
  timestamp?: number | null;
  userId?: string;
  username?: string;
  chatId?: string;
  callbackData?: string;
}

interface DeadLetterEvent {
  channel: string;
  messageId: string | null;
  sender: string | null;
  body?: string | null;
  attempts: number;
  error: string;
  payload?: unknown;
}

type TransportLike = {
  send: (to: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
};

class App {
  store: LocalStore;
  access: AccessController;
  router: CommandRouter;
  adapter: OpenCodeAdapter;
  safety: SafetyEngine;
  formatter: MessageFormatter;
  executor: CommandExecutor;
  whatsappTransport: WhatsAppTransport;
  telegramTransport: TelegramTransport;
  transports: Map<string, TransportLike>;
  stopEventStream: (() => void) | null;
  messageQueues: Map<string, Promise<unknown>>;

  constructor() {
    this.store = new LocalStore(String(config.get('storage.dbPath') || './data/opencode-remote.db'));
    this.access = new AccessController(this.store);
    this.router = new CommandRouter(this.access);
    this.adapter = new OpenCodeAdapter();
    this.safety = new SafetyEngine();
    this.formatter = new MessageFormatter();
    this.executor = new CommandExecutor(this.adapter, this.access, this.store);
    this.whatsappTransport = new WhatsAppTransport(this.handleMessage.bind(this), {
      onDeadLetter: this.handleTransportDeadLetter.bind(this),
    });
    this.telegramTransport = new TelegramTransport(this.handleMessage.bind(this), {
      onDeadLetter: this.handleTransportDeadLetter.bind(this),
    });
    this.transports = new Map<string, TransportLike>([
      ['whatsapp', this.whatsappTransport],
      ['telegram', this.telegramTransport],
    ]);
    this.stopEventStream = null;
    this.messageQueues = new Map();
  }

  async start() {
    this.validateConfig();
    this.store.init();
    this.store.ensureOwner(config.normalizePhone(String(config.get('security.ownerNumber') || '')));
    this.seedOwnerTelegramIdentity();

    const connected = await this.adapter.start();
    if (!connected) {
      logger.fatal('Cannot start app without OpenCode server connection');
      process.exit(1);
    }

    await this.startEnabledTransports();
    await this.startEventMonitor();

    logger.info('OpenCode Remote started');
    this.installShutdownHandlers();
  }

  async startEventMonitor() {
    try {
      this.stopEventStream = await this.adapter.subscribeGlobalEvents(
        this.handleGlobalEvent.bind(this),
      );
      logger.info('Global event monitor started');
    } catch (error) {
      logger.warn({ err: error }, 'Global event monitor disabled');
    }
  }

  async handleGlobalEvent(eventEnvelope) {
    const payload = eventEnvelope?.payload || eventEnvelope?.data?.payload;
    const eventId = eventEnvelope?.id || eventEnvelope?.data?.id || null;

    if (eventId) {
      this.store.setEventOffset('global', String(eventId));
    }

    if (!payload) {
      return;
    }

    if (payload.type === 'permission.updated') {
      const permission = payload.properties;
      const session = this.access.findSessionByActiveSessionId(permission?.sessionID);
      const owner = config.normalizePhone(config.get('security.ownerNumber'));
      const target = session?.phoneNumber || owner;

      if (!target) {
        return;
      }

      this.auditEvent('permission.updated', {
        sessionId: permission?.sessionID,
        permissionId: permission?.id,
        target,
      });

      const binding = this.store.getBinding(target);
      const telegramChatId = binding?.telegram_chat_id || null;
      const message = this.formatter.formatPermissionRequest(permission);
      await this.sendToAvailableChannels(target, telegramChatId, message);
    }
  }

  validateConfig() {
    const ownerNumber = config.get('security.ownerNumber');
    if (!ownerNumber) {
      logger.fatal('Missing required config: security.ownerNumber');
      logger.info('Set it with: npx conf set security.ownerNumber "+15551234567"');
      process.exit(1);
    }
  }

  async handleMessage(event: IncomingMessageEvent) {
    const channel = event?.channel || 'whatsapp';
    const rawFrom = event?.from || '';
    const sender = this.resolveSender(event);

    return this.withSenderLock(sender || `${channel}:${event?.userId || rawFrom || 'unknown'}`, async () => {
      const body = event?.body || '';
      const messageId = event?.messageId || `${channel}-generated-${Date.now()}`;
      const dedupSender = this.resolveDedupSender(event, sender);
      const dedupKey = this.buildDedupKey(channel, dedupSender, messageId);

      if (!sender) {
        return this.formatter.formatError(
          'Access',
          channel === 'telegram'
            ? 'Access denied. Telegram account is not bound. Ask owner to run @oc /users bindtg <telegramUserId> <+phone> [username].'
            : 'Access denied. Your number is not allowlisted.',
        );
      }

      if (this.isDuplicate(dedupKey)) {
        return '✅ Already processed.';
      }
      this.store.markMessageProcessed({
        dedupKey,
        channel,
        sender: dedupSender,
        transportMessageId: String(messageId),
      });

      this.auditEvent('message.incoming', {
        sender,
        rawFrom,
        messageId,
        channel,
        body,
      });

      const access = this.access.checkAccess(sender);
      if (!access.allowed) {
        this.auditEvent('access.denied', { sender });
        return this.formatter.formatError('Access', 'Access denied. Your number is not allowlisted.');
      }

      const session = this.access.getOrCreateSession(sender);
      if (channel === 'telegram' && event?.chatId) {
        this.store.upsertBinding(sender, { telegramChatId: String(event.chatId) });
      }
      await this.ensureSessionWorkspace(session);

      if (this.access.checkInactivity(session)) {
        return this.formatter.formatWarning(
          'Session',
          'Session locked due to inactivity. Ask owner to unlock with @oc /unlock.',
        );
      }

      const parsed = await this.router.parse(body);
      if (!parsed) {
        return null;
      }

      const routed = await this.router.route(parsed, session, {
        sender,
        role: session.role,
      });

      if (typeof routed === 'string') {
        if (routed.includes('Only the owner can')) {
          this.auditEvent('command.blocked', {
            sender,
            command: parsed.command,
            reason: 'owner_only_policy',
          });
        }
        this.auditEvent('command.responded', {
          sender,
          command: parsed.command,
          mode: 'direct',
        });
        return routed;
      }

      const safety = this.safety.evaluate(routed);
      if (!safety.allowed) {
        this.auditEvent('command.blocked', {
          sender,
          command: routed.type,
          reason: safety.reason,
        });
        return this.formatter.formatWarning(
          'Safety',
          `Blocked by safety policy: ${safety.reason}`,
        );
      }

      try {
        if (this.access.isBusy(session)) {
          return this.formatter.formatWarning(
            'Queue',
            'Still processing your previous command. Wait or use @oc /abort.',
          );
        }

        this.access.setBusy(session, true);

        if (this.shouldSendProgress(routed.type)) {
          await this.sendChannel(
            channel,
            rawFrom,
            this.formatter.formatSuccess(
              'Working',
              `Processing ${routed.type}. I will send the result shortly.`,
            ),
          );
        }

        const output = await this.executor.execute(routed, session);
        const runId = this.shouldStoreRun(routed.type) ? randomUUID().slice(0, 8).toUpperCase() : null;
        if (runId) {
          this.store.saveRun({
            runId,
            phone: session.phoneNumber,
            sessionId: this.access.getActiveSessionId(session),
            commandType: routed.type,
            display: output,
            raw: output,
          });
        }

        this.auditEvent('command.executed', {
          sender,
          command: routed.type,
          ok: true,
          runId,
        });
        return this.formatter.formatWithRunId(output, runId);
      } catch (error) {
        logger.error({ err: error, sender, command: routed.type }, 'Command execution failed');
        this.auditEvent('command.executed', {
          sender,
          command: routed.type,
          ok: false,
          error: String(error?.message || error),
        });
        return this.formatter.formatError('Execute', error?.message || 'Unknown error');
      } finally {
        this.access.setBusy(session, false);
      }
    });
  }

  withSenderLock(sender: string, task: () => Promise<string | null>) {
    const key = sender || 'unknown';
    const previous = this.messageQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => null).then(() => task());
    const queued = current.finally(() => {
      if (this.messageQueues.get(key) === queued) {
        this.messageQueues.delete(key);
      }
    });

    this.messageQueues.set(key, queued);
    return current;
  }

  auditEvent(type: string, payload: unknown): void {
    this.store.appendAudit(type, payload);
  }

  handleTransportDeadLetter(event: DeadLetterEvent): void {
    this.store.appendDeadLetter({
      channel: event.channel,
      messageId: event.messageId,
      sender: event.sender,
      body: event.body || '',
      error: event.error,
      attempts: event.attempts,
      payload: event.payload || {},
    });
    this.auditEvent('transport.dead_letter', {
      channel: event.channel,
      messageId: event.messageId,
      sender: event.sender,
      attempts: event.attempts,
      error: event.error,
    });
  }

  resolveSender(event: IncomingMessageEvent): string {
    const channel = event?.channel || 'whatsapp';
    if (channel === 'telegram') {
      const userId = String(event?.userId || '').trim();
      if (!userId) {
        return '';
      }
      return this.store.getPhoneByTelegramUserId(userId) || '';
    }

    return config.normalizePhone(event?.from || '');
  }

  resolveDedupSender(event: IncomingMessageEvent, sender: string): string {
    const channel = event?.channel || 'whatsapp';
    if (channel === 'telegram') {
      const userId = String(event?.userId || '').trim();
      if (userId) {
        return userId;
      }
    }

    return sender || config.normalizePhone(event?.from || '') || String(event?.from || 'unknown');
  }

  buildDedupKey(channel: string, sender: string, messageId: string): string {
    return `${channel}:${sender}:${String(messageId || '')}`;
  }

  seedOwnerTelegramIdentity() {
    const ownerPhone = config.normalizePhone(config.get('security.ownerNumber'));
    const ownerUserId = String(config.get('telegram.ownerUserId') || '').trim();
    if (!ownerPhone || !ownerUserId) {
      return;
    }

    this.store.setTelegramIdentity(ownerPhone, {
      userId: ownerUserId,
      username: null,
    });
  }

  async startEnabledTransports() {
    if (config.get('whatsapp.enabled')) {
      await this.whatsappTransport.start();
    }
    if (config.get('telegram.enabled')) {
      await this.telegramTransport.start();
    }
  }

  async sendChannel(channel: string, to: string, text: string) {
    const transport = this.transports.get(channel);
    if (!transport?.send) {
      return;
    }
    await transport.send(to, text);
  }

  async sendToAvailableChannels(phoneNumber: string, telegramChatId: string | null, text: string) {
    if (config.get('whatsapp.enabled')) {
      await this.sendChannel('whatsapp', phoneNumber, text);
    }
    if (config.get('telegram.enabled') && telegramChatId) {
      await this.sendChannel('telegram', telegramChatId, text);
    }
  }

  async ensureSessionWorkspace(session: SessionState): Promise<void> {
    if (this.access.getWorkspaceRoot(session)) {
      return;
    }

    const currentPath = await this.adapter.getCurrentPath();
    if (currentPath) {
      this.access.setWorkspaceRoot(session, currentPath);
    }
  }

  isDuplicate(dedupKey: string): boolean {
    return this.store.isMessageProcessed(dedupKey);
  }

  shouldSendProgress(commandType: string): boolean {
    const longRunning = new Set([
      'prompt',
      'run',
      'shell',
      'find.text',
      'find.files',
      'diff',
      'summarize',
    ]);
    return longRunning.has(commandType);
  }

  shouldStoreRun(commandType: string): boolean {
    const nonStored = new Set(['output.get', 'output.runs', 'status', 'help']);
    return !nonStored.has(commandType);
  }

  installShutdownHandlers() {
    const confirmCleanupInterval = setInterval(() => {
      this.access.cleanupExpiredConfirms();
      this.access.cleanupStaleSessions();
    }, 30 * 1000);

    const stop = async () => {
      logger.info('Shutting down OpenCode Remote...');
      clearInterval(confirmCleanupInterval);
      if (this.stopEventStream) {
        this.stopEventStream();
        this.stopEventStream = null;
      }
      await this.whatsappTransport.stop();
      await this.telegramTransport.stop();
      await this.adapter.stop();
      process.exit(0);
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
}

const app = new App();
app.start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start OpenCode Remote');
  process.exit(1);
});
