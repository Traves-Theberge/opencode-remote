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
import { looksLikePlaceholderToken } from './security/redaction.js';
import { TransformersAsr } from './media/asr.js';
import { unlink } from 'node:fs/promises';

interface IncomingMediaPayload {
  kind: 'voice' | 'audio' | 'image';
  mimeType: string;
  filename: string;
  filePath: string;
  caption?: string;
}

interface IncomingMessageEvent {
  channel?: 'whatsapp' | 'telegram';
  from?: string;
  body?: string;
  messageId?: string | null;
  timestamp?: number | null;
  userId?: string;
  username?: string;
  chatId?: string;
  callbackData?: string;
  media?: IncomingMediaPayload;
}

interface RoutedIntent {
  type: string;
  [key: string]: unknown;
}

interface GlobalEventEnvelope {
  payload?: { type?: string; properties?: Record<string, unknown> };
  id?: string;
  data?: {
    payload?: { type?: string; properties?: Record<string, unknown> };
    id?: string;
  };
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

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

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
  instanceId: string;
  leaseHeartbeat: NodeJS.Timeout | null;
  leaseAcquireRetry: NodeJS.Timeout | null;
  leaseAcquireInFlight: boolean;
  senderBuckets: Map<string, TokenBucket>;
  globalBucket: TokenBucket;
  telegramConflictAlertedAtCount: number;
  telegramConflictLastAlertAt: number;
  progressAckCounter: number;
  asr: TransformersAsr;

  constructor() {
    this.store = new LocalStore(String(config.get('storage.dbPath') || './data/opencode-remote.db'));
    this.access = new AccessController(this.store);
    this.router = new CommandRouter(this.access);
    this.adapter = new OpenCodeAdapter();
    this.safety = new SafetyEngine();
    this.formatter = new MessageFormatter();
    this.executor = new CommandExecutor(
      this.adapter,
      this.access,
      this.store,
      this.getRuntimeStatus.bind(this),
    );
    this.whatsappTransport = new WhatsAppTransport(this.handleMessage.bind(this), {
      onDeadLetter: this.handleTransportDeadLetter.bind(this),
    });
    this.telegramTransport = new TelegramTransport(this.handleMessage.bind(this), {
      onDeadLetter: this.handleTransportDeadLetter.bind(this),
      onPollingConflict: this.handleTelegramPollingConflict.bind(this),
      onPollingRecovered: this.handleTelegramPollingRecovered.bind(this),
    });
    this.transports = new Map<string, TransportLike>([
      ['whatsapp', this.whatsappTransport],
      ['telegram', this.telegramTransport],
    ]);
    this.stopEventStream = null;
    this.messageQueues = new Map();
    this.instanceId = randomUUID();
    this.leaseHeartbeat = null;
    this.leaseAcquireRetry = null;
    this.leaseAcquireInFlight = false;
    this.senderBuckets = new Map();
    this.globalBucket = {
      tokens: Number(config.get('security.ingressBurst') || 10),
      lastRefillAt: Date.now(),
    };
    this.telegramConflictAlertedAtCount = 0;
    this.telegramConflictLastAlertAt = 0;
    this.progressAckCounter = 0;
    this.asr = new TransformersAsr();
  }

  /**
   * Boot application: validate config, init storage, connect adapter, then start transports.
   */
  async start() {
    this.validateConfig();
    this.logRuntimeFingerprint();
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

  logRuntimeFingerprint() {
    const token = String(config.get('telegram.botToken') || '');
    const tokenFingerprint = token
      ? `len:${token.length}:..${token.slice(Math.max(0, token.length - 6))}`
      : 'missing';
    logger.info(
      {
        version: process.env.npm_package_version || 'unknown',
        buildId: process.env.OPENCODE_REMOTE_BUILD_ID || 'dev',
        instanceId: this.instanceId,
        pid: process.pid,
        node: process.version,
        dbPath: String(config.get('storage.dbPath') || ''),
        telegram: {
          enabled: Boolean(config.get('telegram.enabled')),
          pollingEnabled: Boolean(config.get('telegram.pollingEnabled')),
          webhookEnabled: Boolean(config.get('telegram.webhookEnabled')),
          tokenFingerprint,
        },
      },
      'Runtime fingerprint',
    );
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

  async handleGlobalEvent(eventEnvelope: unknown) {
    const normalized = eventEnvelope as GlobalEventEnvelope;
    const payload = normalized?.payload || normalized?.data?.payload;
    const eventId = normalized?.id || normalized?.data?.id || null;

    if (eventId) {
      this.store.setEventOffset('global', String(eventId));
    }

    if (!payload) {
      return;
    }

    if (payload.type === 'permission.updated') {
      const permission = payload.properties || {};
      const permissionSessionId =
        typeof permission?.sessionID === 'string' ? permission.sessionID : '';
      const session = this.access.findSessionByActiveSessionId(permissionSessionId);
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
    const ownerNumber = String(config.get('security.ownerNumber') || '').trim();
    if (!ownerNumber) {
      logger.fatal('Missing required config: security.ownerNumber');
      logger.info('Set it with: npx conf set security.ownerNumber "+15551234567"');
      process.exit(1);
    }

    const telegramEnabled = Boolean(config.get('telegram.enabled'));
    const webhookEnabled = Boolean(config.get('telegram.webhookEnabled'));
    const botToken = String(config.get('telegram.botToken') || '').trim();
    const webhookUrl = String(config.get('telegram.webhookUrl') || '').trim();
    const webhookSecret = String(config.get('telegram.webhookSecret') || '').trim();

    if (telegramEnabled && !botToken) {
      logger.fatal('Missing required config: telegram.botToken (Telegram is enabled)');
      process.exit(1);
    }

    if (botToken && looksLikePlaceholderToken(botToken)) {
      logger.warn('telegram.botToken looks like a placeholder/example value. Rotate before production use.');
    }

    if (webhookEnabled) {
      if (!webhookUrl) {
        logger.fatal('Missing required config: telegram.webhookUrl (webhook mode enabled)');
        process.exit(1);
      }
      if (!webhookSecret) {
        logger.fatal('Missing required config: telegram.webhookSecret (webhook mode enabled)');
        process.exit(1);
      }
    }

    const requireEnvTokens = Boolean(config.get('security.requireEnvTokens'));
    if (requireEnvTokens) {
      this.enforceEnvOnlySecret('telegram.botToken');
      this.enforceEnvOnlySecret('telegram.webhookSecret', { requiredWhen: webhookEnabled });
    }
  }

  /**
   * Process inbound message from any transport and return user-facing response text.
   */
  async handleMessage(event: IncomingMessageEvent): Promise<string | null> {
    const channel = event?.channel || 'whatsapp';
    const rawFrom = event?.from || '';
    const sender = this.resolveSender(event);

    return this.withSenderLock(sender || `${channel}:${event?.userId || rawFrom || 'unknown'}`, async () => {
      let body = event?.body || '';
      const messageId = event?.messageId || `${channel}-generated-${Date.now()}`;
      const dedupSender = this.resolveDedupSender(event, sender);
      const dedupKey = this.buildDedupKey(channel, dedupSender, messageId);
      const media = event?.media || null;
      const promptFiles: Array<{ filePath: string; mimeType: string; filename: string }> = [];
      const cleanupPaths: string[] = [];

      if (!sender) {
          return this.formatter.formatError(
            'Access',
            channel === 'telegram'
              ? 'Access denied. Telegram account is not bound. Ask owner to run /users bindtg <telegramUserId> <+phone> [username].'
              : 'Access denied. Your number is not allowlisted.',
          );
      }

      if (this.isDuplicate(dedupKey)) {
        return '✅ Already processed.';
      }

      const throttle = this.checkIngressRateLimit(sender || dedupSender);
      if (throttle.limited) {
        this.auditEvent('ingress.throttled', {
          sender,
          channel,
          scope: throttle.scope,
          retryAfterMs: throttle.retryAfterMs,
        });
        return this.formatter.formatWarning(
          'Throttle',
          `Too many requests. Retry in ${Math.max(1, Math.ceil(throttle.retryAfterMs / 1000))}s.`,
        );
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
        media: media
          ? {
              kind: media.kind,
              mimeType: media.mimeType,
              filename: media.filename,
            }
          : null,
      });

      if (media) {
        cleanupPaths.push(media.filePath);
        if (media.kind === 'image' && Boolean(config.get('media.imageEnabled'))) {
          promptFiles.push({
            filePath: media.filePath,
            mimeType: media.mimeType,
            filename: media.filename,
          });
          if (!body.trim()) {
            body = String(media.caption || '').trim() || 'Please analyze this image.';
          }
        }

        if ((media.kind === 'voice' || media.kind === 'audio') && Boolean(config.get('media.voiceEnabled'))) {
          try {
            const transcript = await this.asr.transcribe(media.filePath);
            if (!transcript.text) {
              return this.formatter.formatWarning('Voice', 'Could not transcribe voice message.');
            }
            body = transcript.text;
            this.auditEvent('media.transcribed', {
              sender,
              channel,
              kind: media.kind,
              filename: media.filename,
              textLength: transcript.text.length,
            });
          } catch (error) {
            logger.warn({ err: error }, 'Voice transcription failed');
            return this.formatter.formatError(
              'Voice',
              `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

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
          'Session locked due to inactivity. Ask owner to unlock with /unlock.',
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

      const intent = routed as RoutedIntent;
      if (intent.type === 'prompt' && promptFiles.length > 0) {
        intent.files = promptFiles;
      }
      const safety = this.safety.evaluate({
        type: intent.type,
        command: typeof intent.command === 'string' ? intent.command : undefined,
      });
      if (!safety.allowed) {
        this.auditEvent('command.blocked', {
          sender,
          command: intent.type,
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
            'Still processing your previous command. Wait or use /abort.',
          );
        }

        this.access.setBusy(session, true);

        if (this.shouldSendProgress()) {
          this.progressAckCounter += 1;
          await this.sendChannel(
            channel,
            rawFrom,
            this.formatter.formatSuccess(
              'Working',
              this.formatProgressAck(intent.type),
            ),
          );
        }

        const output = await this.executor.execute(intent, session);
        const runId = this.shouldStoreRun(intent.type) ? randomUUID().slice(0, 8).toUpperCase() : null;
        if (runId) {
          this.store.saveRun({
            runId,
            phone: session.phoneNumber,
            sessionId: this.access.getActiveSessionId(session),
            commandType: intent.type,
            display: output,
            raw: output,
          });
        }

        this.auditEvent('command.executed', {
          sender,
          command: intent.type,
          ok: true,
          runId,
        });
        return this.formatter.formatWithRunId(output, runId);
      } catch (error) {
        logger.error({ err: error, sender, command: intent.type }, 'Command execution failed');
        this.auditEvent('command.executed', {
          sender,
          command: intent.type,
          ok: false,
          error: String(error instanceof Error ? error.message : error),
        });
        return this.formatter.formatError(
          'Execute',
          error instanceof Error ? error.message : 'Unknown error',
        );
      } finally {
        this.access.setBusy(session, false);
        await Promise.all(
          cleanupPaths.map(async (filePath) => {
            try {
              await unlink(filePath);
            } catch {
              // best-effort temp cleanup
            }
          }),
        );
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

  async handleTransportDeadLetter(event: DeadLetterEvent): Promise<void> {
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
      const pollingEnabled = Boolean(config.get('telegram.pollingEnabled'));
      const webhookEnabled = Boolean(config.get('telegram.webhookEnabled'));
      const shouldLeasePolling = pollingEnabled && !webhookEnabled;

      if (shouldLeasePolling) {
        await this.ensureTelegramPollingLease();
        return;
      }

      await this.telegramTransport.start();
    }
  }

  async ensureTelegramPollingLease() {
    const acquired = this.store.acquireTransportLease('telegram-polling', this.instanceId, 60_000);
    if (!acquired) {
      const lease = this.store.getTransportLease('telegram-polling');
      logger.warn(
        {
          lease,
          retryInMs: 5000,
          expiresInMs: lease ? Math.max(0, lease.expires_at - Date.now()) : 0,
        },
        'Telegram polling lease owned elsewhere; retrying acquisition',
      );
      this.schedulePollingLeaseRetry();
      return;
    }

    this.startPollingLeaseHeartbeat();
    if (!this.telegramTransport.running) {
      try {
        await this.telegramTransport.start();
      } catch (error) {
        logger.error({ err: error }, 'Telegram transport failed to start after lease acquisition');
        this.store.releaseTransportLease('telegram-polling', this.instanceId);
        this.schedulePollingLeaseRetry();
      }
    }
  }

  startPollingLeaseHeartbeat() {
    if (this.leaseHeartbeat) {
      return;
    }

    this.leaseHeartbeat = setInterval(() => {
      const renewed = this.store.renewTransportLease('telegram-polling', this.instanceId, 60_000);
      if (!renewed) {
        logger.warn('Telegram polling lease renewal failed; transport may be preempted');
      }
    }, 20_000);
  }

  schedulePollingLeaseRetry() {
    if (this.leaseAcquireRetry) {
      return;
    }

    this.leaseAcquireRetry = setInterval(() => {
      if (this.leaseAcquireInFlight) {
        return;
      }

      this.leaseAcquireInFlight = true;
      void this.ensureTelegramPollingLease().finally(() => {
        this.leaseAcquireInFlight = false;
      });
    }, 5000);
  }

  /**
   * Runtime status snapshot used by status and diagnostics commands.
   */
  getRuntimeStatus() {
    const lease = this.store.getTransportLease('telegram-polling');
    const now = Date.now();
    return {
      telegram: this.telegramTransport.getHealth(),
      channels: {
        telegramEnabled: Boolean(config.get('telegram.enabled')),
        whatsappEnabled: Boolean(config.get('whatsapp.enabled')),
      },
      build: {
        version: process.env.npm_package_version || 'unknown',
        buildId: process.env.OPENCODE_REMOTE_BUILD_ID || 'dev',
      },
      lease: {
        ownerId: lease?.owner_id || null,
        expiresInMs: lease ? Math.max(0, lease.expires_at - now) : 0,
        ownedByCurrentInstance: Boolean(lease && lease.owner_id === this.instanceId),
      },
    };
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

  shouldSendProgress(): boolean {
    return false;
  }

  shouldStoreRun(commandType: string): boolean {
    const nonStored = new Set(['output.get', 'output.runs', 'status', 'help', 'diff', 'summarize']);
    return !nonStored.has(commandType);
  }

  formatProgressAck(commandType: string): string {
    const templates = [
      `Processing now - running ${commandType}.`,
      `Processing now - your request is in flight.`,
      `Processing now - working through ${commandType}.`,
      `Processing now - let me cook for a sec.`,
      `Processing now - we are on it.`,
      `Processing now - output coming shortly.`,
      `Processing now - executing with style.`,
      `Processing now - this one is underway.`,
      `Processing now - smooth and spicy.`,
      `Processing now - handled. Results soon.`,
    ];

    const randomOffset = Math.floor(Math.random() * templates.length);
    const index = (this.progressAckCounter + randomOffset) % templates.length;
    return templates[index] || templates[0] || 'Processing now - working...';
  }

  installShutdownHandlers() {
    const confirmCleanupInterval = setInterval(() => {
      this.access.cleanupExpiredConfirms();
      this.access.cleanupStaleSessions();
    }, 30 * 1000);

    const stop = async () => {
      logger.info('Shutting down OpenCode Remote...');
      clearInterval(confirmCleanupInterval);
      if (this.leaseHeartbeat) {
        clearInterval(this.leaseHeartbeat);
        this.leaseHeartbeat = null;
      }
      if (this.leaseAcquireRetry) {
        clearInterval(this.leaseAcquireRetry);
        this.leaseAcquireRetry = null;
      }
      this.store.releaseTransportLease('telegram-polling', this.instanceId);
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

  enforceEnvOnlySecret(key: string, options: { requiredWhen?: boolean } = {}): void {
    const required = options.requiredWhen !== false;
    const persisted = String(config.getPersisted(key) || '').trim();
    const hasEnv = config.hasEnvOverride(key);

    if (persisted) {
      logger.fatal({ key }, 'Env-only secret mode is enabled and persisted secret value was found. Remove it from local config.');
      process.exit(1);
    }

    if (required && !hasEnv) {
      logger.fatal({ key }, 'Env-only secret mode is enabled and required secret env var is missing.');
      process.exit(1);
    }
  }

  checkIngressRateLimit(sender: string): { limited: boolean; scope: 'global' | 'sender'; retryAfterMs: number } {
    const senderRate = Math.max(1, Number(config.get('security.ingressPerSenderPerMinute')) || 30);
    const globalRate = Math.max(1, Number(config.get('security.ingressGlobalPerMinute')) || 240);
    const burst = Math.max(1, Number(config.get('security.ingressBurst')) || 10);
    const now = Date.now();

    if (!this.consumeFromBucket(this.globalBucket, globalRate, burst, now)) {
      return {
        limited: true,
        scope: 'global',
        retryAfterMs: this.estimateRetryMs(this.globalBucket, globalRate, now),
      };
    }

    const key = sender || 'unknown';
    const bucket = this.senderBuckets.get(key) || { tokens: burst, lastRefillAt: now };
    this.senderBuckets.set(key, bucket);
    if (!this.consumeFromBucket(bucket, senderRate, burst, now)) {
      return {
        limited: true,
        scope: 'sender',
        retryAfterMs: this.estimateRetryMs(bucket, senderRate, now),
      };
    }

    if (this.senderBuckets.size > 5000) {
      for (const [bucketKey, bucketValue] of this.senderBuckets.entries()) {
        if (now - bucketValue.lastRefillAt > 15 * 60 * 1000) {
          this.senderBuckets.delete(bucketKey);
        }
      }
    }

    return { limited: false, scope: 'sender', retryAfterMs: 0 };
  }

  consumeFromBucket(bucket: TokenBucket, perMinute: number, burst: number, now: number): boolean {
    const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
    const refillPerMs = perMinute / 60_000;
    const capacity = Math.max(burst, perMinute);
    const replenished = Math.min(capacity, bucket.tokens + elapsedMs * refillPerMs);
    bucket.tokens = replenished;
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) {
      return false;
    }

    bucket.tokens -= 1;
    return true;
  }

  estimateRetryMs(bucket: TokenBucket, perMinute: number, now: number): number {
    const refillPerMs = perMinute / 60_000;
    if (refillPerMs <= 0) {
      return 1000;
    }
    if (bucket.tokens >= 1) {
      return 0;
    }
    const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
    const tokensNow = Math.max(0, bucket.tokens + elapsedMs * refillPerMs);
    return Math.max(250, Math.ceil((1 - tokensNow) / refillPerMs));
  }

  async notifyOwnerAboutPollingConflict(conflictCount: number, retryInMs: number): Promise<void> {
    const owner = config.normalizePhone(config.get('security.ownerNumber'));
    if (!owner) {
      return;
    }

    const binding = this.store.getBinding(owner);
    const chatId = binding?.telegram_chat_id || null;
    const message = this.formatter.formatWarning(
      'Telegram Polling',
      `Polling conflict detected ${conflictCount} time(s). Retrying in ${Math.max(1, Math.ceil(retryInMs / 1000))}s. Alerting is now cooldown-limited to reduce spam while recovery runs.`,
    );

    try {
      await this.sendToAvailableChannels(owner, chatId, message);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to send polling conflict alert to owner');
    }
  }

  handleTelegramPollingConflict(event: {
    conflictCount: number;
    retryInMs: number;
    pausedUntil: number;
    error: string;
    recoveryBlockedForMs: number;
    lastRecoveryError: string;
  }): void {
    this.auditEvent('telegram.polling_conflict', {
      conflictCount: event.conflictCount,
      retryInMs: event.retryInMs,
      pausedUntil: event.pausedUntil,
      error: event.error,
      recoveryBlockedForMs: event.recoveryBlockedForMs,
      lastRecoveryError: event.lastRecoveryError,
    });

    const threshold = Math.max(1, Number(config.get('telegram.pollingConflictAlertThreshold')) || 3);
    const cooldownMs = Math.max(1000, Number(config.get('telegram.pollingConflictAlertCooldownMs')) || 300_000);
    const now = Date.now();
    const thresholdCrossed = this.telegramConflictAlertedAtCount < threshold && event.conflictCount >= threshold;
    const cooldownElapsed = now - this.telegramConflictLastAlertAt >= cooldownMs;
    if ((thresholdCrossed || cooldownElapsed) && event.conflictCount >= threshold) {
      this.telegramConflictAlertedAtCount = event.conflictCount;
      this.telegramConflictLastAlertAt = now;
      void this.notifyOwnerAboutPollingConflict(event.conflictCount, event.retryInMs);
    }
  }

  handleTelegramPollingRecovered(event: { recoveredAt: number }): void {
    this.auditEvent('telegram.polling_recovered', event);
    this.telegramConflictAlertedAtCount = 0;
    this.telegramConflictLastAlertAt = 0;
  }
}

const app = new App();
app.start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start OpenCode Remote');
  process.exit(1);
});
