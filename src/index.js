import { logger } from './core/logger.js';
import { config } from './core/config.js';
import { WhatsAppTransport } from './transport/whatsapp.js';
import { AccessController } from './access/controller.js';
import { CommandRouter } from './router/index.js';
import { OpenCodeAdapter } from './adapter/opencode.js';
import { SafetyEngine } from './safety/engine.js';
import { AuditLogger } from './audit/logger.js';
import { CommandExecutor } from './commands/executor.js';
import { MessageFormatter } from './presentation/formatter.js';
import { LocalStore } from './storage/sqlite.js';
import { randomUUID } from 'node:crypto';

class App {
  constructor() {
    this.store = new LocalStore(config.get('storage.dbPath'));
    this.access = new AccessController(this.store);
    this.router = new CommandRouter(this.access);
    this.adapter = new OpenCodeAdapter();
    this.safety = new SafetyEngine();
    this.audit = new AuditLogger();
    this.formatter = new MessageFormatter();
    this.executor = new CommandExecutor(this.adapter, this.access, this.store);
    this.transport = new WhatsAppTransport(this.handleMessage.bind(this));
    this.stopEventStream = null;
  }

  async start() {
    this.validateConfig();
    this.store.init();
    this.store.ensureOwner(config.normalizePhone(config.get('security.ownerNumber')));
    await this.audit.init();

    const connected = await this.adapter.start();
    if (!connected) {
      logger.fatal('Cannot start app without OpenCode server connection');
      process.exit(1);
    }

    await this.transport.start();
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

      await this.audit.write({
        type: 'permission.updated',
        sessionId: permission?.sessionID,
        permissionId: permission?.id,
        target,
      });
      this.store.appendAudit('permission.updated', {
        sessionId: permission?.sessionID,
        permissionId: permission?.id,
        target,
      });

      await this.transport.send(target, this.formatter.formatPermissionRequest(permission));
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

  async handleMessage(event) {
    const rawFrom = event?.from || '';
    const body = event?.body || '';
    const messageId = event?.messageId || `generated-${Date.now()}`;
    const sender = config.normalizePhone(rawFrom);

    if (this.isDuplicate(messageId)) {
      return '✅ Already processed.';
    }
    this.store.markMessageProcessed(messageId, sender);

    await this.audit.write({
      type: 'message.incoming',
      sender,
      rawFrom,
      messageId,
      body,
    });
    this.store.appendAudit('message.incoming', { sender, rawFrom, messageId, body });

    const access = this.access.checkAccess(sender);
    if (!access.allowed) {
      await this.audit.write({
        type: 'access.denied',
        sender,
      });
      this.store.appendAudit('access.denied', { sender });
      return this.formatter.formatError('Access', 'Access denied. Your number is not allowlisted.');
    }

    const session = this.access.getOrCreateSession(sender);
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
      await this.audit.write({
        type: 'command.responded',
        sender,
        command: parsed.command,
        mode: 'direct',
      });
      this.store.appendAudit('command.responded', {
        sender,
        command: parsed.command,
        mode: 'direct',
      });
      return routed;
    }

    const safety = this.safety.evaluate(routed);
    if (!safety.allowed) {
      await this.audit.write({
        type: 'command.blocked',
        sender,
        command: routed.type,
        reason: safety.reason,
      });
      this.store.appendAudit('command.blocked', {
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
        await this.transport.send(
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

      await this.audit.write({
        type: 'command.executed',
        sender,
        command: routed.type,
        ok: true,
        runId,
      });
      this.store.appendAudit('command.executed', {
        sender,
        command: routed.type,
        ok: true,
        runId,
      });
      return this.formatter.formatWithRunId(output, runId);
    } catch (error) {
      logger.error({ err: error, sender, command: routed.type }, 'Command execution failed');
      await this.audit.write({
        type: 'command.executed',
        sender,
        command: routed.type,
        ok: false,
        error: String(error?.message || error),
      });
      this.store.appendAudit('command.executed', {
        sender,
        command: routed.type,
        ok: false,
        error: String(error?.message || error),
      });
      return this.formatter.formatError('Execute', error?.message || 'Unknown error');
    } finally {
      this.access.setBusy(session, false);
    }
  }

  async ensureSessionWorkspace(session) {
    if (this.access.getWorkspaceRoot(session)) {
      return;
    }

    const currentPath = await this.adapter.getCurrentPath();
    if (currentPath) {
      this.access.setWorkspaceRoot(session, currentPath);
    }
  }

  isDuplicate(messageId) {
    return this.store.isMessageProcessed(messageId);
  }

  shouldSendProgress(commandType) {
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

  shouldStoreRun(commandType) {
    const nonStored = new Set(['output.get', 'output.runs', 'status', 'help']);
    return !nonStored.has(commandType);
  }

  installShutdownHandlers() {
    const confirmCleanupInterval = setInterval(() => {
      this.access.cleanupExpiredConfirms();
    }, 30 * 1000);

    const stop = async () => {
      logger.info('Shutting down OpenCode Remote...');
      clearInterval(confirmCleanupInterval);
      if (this.stopEventStream) {
        this.stopEventStream();
        this.stopEventStream = null;
      }
      await this.transport.stop();
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
