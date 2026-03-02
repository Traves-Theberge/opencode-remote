import http from 'node:http';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface TelegramInboundEvent {
  channel: 'telegram';
  from: string;
  body: string;
  messageId: string;
  timestamp: number | null;
  userId: string;
  username: string;
  chatId: string;
  callbackData?: string;
}

interface TelegramDeadLetter {
  channel: 'telegram';
  messageId: string;
  sender: string | null;
  body: string;
  error: string;
  attempts: number;
  payload: unknown;
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    message_id?: number;
    date?: number;
    from?: { id?: number; username?: string };
    chat?: { id?: number; type?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; username?: string };
    message?: {
      message_id?: number;
      date?: number;
      chat?: { id?: number; type?: string };
    };
  };
};

const DEFAULT_KEYBOARD = {
  inline_keyboard: [
    [
      { text: 'Status', callback_data: 'oc:status' },
      { text: 'Sessions', callback_data: 'oc:session_list' },
      { text: 'Diff', callback_data: 'oc:diff' },
    ],
    [
      { text: 'Runs', callback_data: 'oc:runs' },
      { text: 'Abort', callback_data: 'oc:abort' },
      { text: 'Help', callback_data: 'oc:help' },
    ],
  ],
};

export class TelegramTransport {
  onMessage: (event: TelegramInboundEvent) => Promise<string | null>;
  onDeadLetter: ((event: TelegramDeadLetter) => Promise<void>) | null;
  onPollingConflict:
    | ((event: { conflictCount: number; retryInMs: number; pausedUntil: number; error: string }) => void)
    | null;
  onPollingRecovered: ((event: { recoveredAt: number }) => void) | null;
  running: boolean;
  offset: number;
  poller: NodeJS.Timeout | null;
  webhookServer: http.Server | null;
  pollingPausedUntil: number;
  pollingConflictCount: number;

  constructor(
    onMessage: (event: TelegramInboundEvent) => Promise<string | null>,
    options: {
      onDeadLetter?: (event: TelegramDeadLetter) => Promise<void>;
      onPollingConflict?: (event: {
        conflictCount: number;
        retryInMs: number;
        pausedUntil: number;
        error: string;
      }) => void;
      onPollingRecovered?: (event: { recoveredAt: number }) => void;
    } = {},
  ) {
    this.onMessage = onMessage;
    this.onDeadLetter = options.onDeadLetter || null;
    this.onPollingConflict = options.onPollingConflict || null;
    this.onPollingRecovered = options.onPollingRecovered || null;
    this.running = false;
    this.offset = 0;
    this.poller = null;
    this.webhookServer = null;
    this.pollingPausedUntil = 0;
    this.pollingConflictCount = 0;
  }

  /**
   * Start Telegram transport in webhook or polling mode.
   */
  async start() {
    if (!config.get('telegram.enabled')) {
      logger.info('Telegram transport disabled by config');
      return;
    }

    const token = config.get('telegram.botToken');
    if (!token) {
      logger.warn('Telegram transport disabled: telegram.botToken is missing');
      return;
    }

    this.running = true;

    const commands = [
      { command: 'status', description: 'Show system status' },
      { command: 'help', description: 'Show help' },
      { command: 'session_list', description: 'List sessions' },
      { command: 'session_new', description: 'Create session' },
      { command: 'diff', description: 'Show diff' },
      { command: 'runs', description: 'Show recent run IDs' },
      { command: 'abort', description: 'Abort active run' },
    ];

    await this.api('setMyCommands', { commands }).catch((error) => {
      logger.warn({ err: error }, 'Failed to register Telegram commands');
    });

    const webhookEnabled = Boolean(config.get('telegram.webhookEnabled'));
    const pollingEnabled = Boolean(config.get('telegram.pollingEnabled'));

    if (webhookEnabled && pollingEnabled) {
      logger.warn(
        'Both telegram.webhookEnabled and telegram.pollingEnabled are true; defaulting to webhook mode and disabling polling',
      );
      await this.startWebhook();
    } else if (webhookEnabled) {
      await this.startWebhook();
    } else if (pollingEnabled) {
      this.startPolling();
    } else {
      logger.warn('Telegram transport is enabled but no delivery mode is enabled');
    }

    logger.info('Telegram transport started');
  }

  async startWebhook() {
    const webhookUrl = String(config.get('telegram.webhookUrl') || '');
    if (!webhookUrl) {
      throw new Error('telegram.webhookEnabled=true requires telegram.webhookUrl');
    }

    const secret = String(config.get('telegram.webhookSecret') || '');
    if (!secret) {
      throw new Error('telegram.webhookEnabled=true requires telegram.webhookSecret');
    }
    const host = String(config.get('telegram.webhookHost') || '0.0.0.0');
    const port = Number(config.get('telegram.webhookPort')) || 4097;
    const path = String(config.get('telegram.webhookPath') || '/telegram/webhook');
    const maxBodyBytes = Number(config.get('telegram.webhookMaxBodyBytes')) || 1_000_000;

    await this.api('setWebhook', {
      url: webhookUrl,
      secret_token: secret || undefined,
    });

    this.webhookServer = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== path) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }

      if (secret) {
        const provided = req.headers['x-telegram-bot-api-secret-token'];
        if (provided !== secret) {
          res.statusCode = 401;
          res.end('unauthorized');
          return;
        }
      }

      const chunks = [];
      let total = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBodyBytes) {
          res.statusCode = 413;
          res.end('payload too large');
          return;
        }
        chunks.push(buf);
      }

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const update = JSON.parse(body || '{}');
        await this.processUpdateWithRetry(update);
      } catch (error) {
        logger.warn({ err: error }, 'Invalid Telegram webhook payload');
      }

      res.statusCode = 200;
      res.end('ok');
    });

    await new Promise<void>((resolve) => {
      this.webhookServer?.listen(port, host, () => resolve());
    });

    logger.info({ webhookUrl, host, port, path }, 'Telegram webhook server started');
  }

  startPolling() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }

    const interval = Number(config.get('telegram.pollingIntervalMs')) || 1200;
    this.poller = setInterval(() => {
      this.pollOnce().catch((error) => {
        logger.warn({ err: error }, 'Telegram polling iteration failed');
      });
    }, interval);

    this.pollOnce().catch((error) => {
      logger.warn({ err: error }, 'Initial Telegram polling failed');
    });
  }

  /**
   * Single polling iteration with conflict-aware backoff handling.
   */
  async pollOnce() {
    if (!this.running) {
      return;
    }

    if (Date.now() < this.pollingPausedUntil) {
      return;
    }

    const timeout = Number(config.get('telegram.pollingTimeoutSec')) || 30;
    let response: { result?: TelegramUpdate[] };
    try {
      response = await this.api('getUpdates', {
        offset: this.offset,
        timeout,
        allowed_updates: ['message', 'callback_query'],
      });
      if (this.pollingConflictCount > 0 && this.onPollingRecovered) {
        this.onPollingRecovered({ recoveredAt: Date.now() });
      }
      this.pollingConflictCount = 0;
      this.pollingPausedUntil = 0;
    } catch (error) {
      if (this.isPollingConflict(error)) {
        this.handlePollingConflict(error);
        return;
      }
      throw error;
    }

    const updates = response?.result || [];
    for (const update of updates) {
      this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
      await this.processUpdateWithRetry(update);
    }
  }

  async processUpdateWithRetry(update: TelegramUpdate) {
    const maxRetries = Number(config.get('telegram.messageMaxRetries')) || 3;
    const retryDelayMs = Number(config.get('telegram.messageRetryDelayMs')) || 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.processUpdate(update);
        return;
      } catch (error) {
        const isLast = attempt === maxRetries;
        logger.warn(
          {
            err: error,
            attempt,
            maxRetries,
            updateId: update?.update_id,
          },
          'Telegram update handling attempt failed',
        );

        if (isLast) {
          await this.moveToDeadLetter(update, error, attempt);
          return;
        }

        await this.sleep(retryDelayMs * attempt);
      }
    }
  }

  async processUpdate(update: TelegramUpdate) {
    if (update?.message) {
      await this.handleMessageUpdate(update.message, update?.update_id);
      return;
    }

    if (update?.callback_query) {
      await this.handleCallbackUpdate(update.callback_query, update?.update_id);
    }
  }

  async handleMessageUpdate(message: NonNullable<TelegramUpdate['message']>, updateId?: number) {
    const text = String(message?.text || '').trim();
    if (!text) {
      return;
    }

    if (!this.isAllowedChatType(message?.chat?.type)) {
      logger.info({ chatType: message?.chat?.type }, 'Ignoring Telegram group message by policy');
      return;
    }

    const userId = String(message?.from?.id || '');
    const username = String(message?.from?.username || '');
    const chatId = String(message?.chat?.id || '');

    const normalizedBody = this.normalizeBody(text);
    const response = await this.onMessage({
      channel: 'telegram',
      from: chatId,
      body: normalizedBody,
      messageId: String(updateId || message?.message_id || ''),
      timestamp: message?.date || null,
      userId,
      username,
      chatId,
    });

    if (response) {
      await this.send(chatId, response);
    }
  }

  async handleCallbackUpdate(
    callback: NonNullable<TelegramUpdate['callback_query']>,
    updateId?: number,
  ) {
    const callbackId = callback?.id;
    const data = String(callback?.data || '');
    const userId = String(callback?.from?.id || '');
    const username = String(callback?.from?.username || '');
    const chatId = String(callback?.message?.chat?.id || '');

    if (!this.isAllowedChatType(callback?.message?.chat?.type)) {
      await this.api('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'Group chats are disabled for this bot',
        show_alert: false,
      });
      return;
    }

    await this.api('answerCallbackQuery', {
      callback_query_id: callbackId,
    });

    const command = this.callbackToCommand(data);
    if (!command) {
      return;
    }

    const response = await this.onMessage({
      channel: 'telegram',
      from: chatId,
      body: command,
      messageId: String(updateId || callbackId || ''),
      timestamp: callback?.message?.date || null,
      userId,
      username,
      chatId,
      callbackData: data,
    });

    if (response) {
      await this.send(chatId, response);
    }
  }

  /**
   * Normalize inbound text to canonical command/prompt input.
   */
  normalizeBody(text: string): string {
    if (!text) {
      return '';
    }

    if (text.startsWith('/')) {
      return text.replace('/session_list', '/session list').replace('/session_new', '/session new');
    }

    const shorthand = this.plainTextToCommand(text);
    if (shorthand) {
      return shorthand;
    }

    return text;
  }

  plainTextToCommand(text: string): string | null {
    const normalized = text.trim().toLowerCase();
    const map: Record<string, string> = {
      status: '/status',
      help: '/help',
      runs: '/runs',
      diff: '/diff',
      abort: '/abort',
      sessions: '/session list',
      'session list': '/session list',
      pwd: '/pwd',
    };
    return map[normalized] || null;
  }

  callbackToCommand(data: string): string | null {
    const mapped: Record<string, string> = {
      'oc:status': '/status',
      'oc:session_list': '/session list',
      'oc:diff': '/diff',
      'oc:runs': '/runs',
      'oc:help': '/help',
      'oc:abort': '/abort',
    };

    if (mapped[data]) {
      return mapped[data];
    }

    const permissionMatch = /^oc:perm:([A-Za-z0-9_-]+):(once|always|reject)$/.exec(data);
    if (permissionMatch) {
      const [, permissionId, response] = permissionMatch;
      return `/permission ${permissionId} ${response}`;
    }

    return null;
  }

  async send(to: string, text: string) {
    if (!this.running) {
      return;
    }

    const chatId = String(to || '').trim();
    if (!chatId) {
      return;
    }

    const chunks = this.chunkMessage(String(text || ''), 3500);
    for (const chunk of chunks) {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: chunk,
        reply_markup: DEFAULT_KEYBOARD,
      });
    }
  }

  chunkMessage(text: string, maxLength: number): string[] {
    const chunks = [];
    const lines = text.split('\n');
    let current = '';

    for (const line of lines) {
      if ((current + '\n' + line).length <= maxLength) {
        current += (current ? '\n' : '') + line;
      } else {
        if (current) {
          chunks.push(current);
        }
        current = line;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  async moveToDeadLetter(update: TelegramUpdate, error: unknown, attempts: number) {
    const sender =
      String(update?.message?.from?.id || update?.callback_query?.from?.id || '') || null;
    const body =
      update?.message?.text || update?.callback_query?.data || JSON.stringify(update || {});

    const payload = {
      channel: 'telegram' as const,
      messageId: String(update?.update_id || ''),
      sender,
      body,
      error: String(error instanceof Error ? error.message : error),
      attempts,
      payload: update,
    };

    if (this.onDeadLetter) {
      try {
        await this.onDeadLetter(payload);
      } catch (callbackError) {
        logger.error({ err: callbackError }, 'Telegram dead-letter callback failed');
      }
    }
  }

  async api(method: string, body: Record<string, unknown>) {
    const token = config.get('telegram.botToken');
    const url = `https://api.telegram.org/bot${token}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method} failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API ${method} returned not ok`);
    }

    return data;
  }

  isPollingConflict(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error).toLowerCase();
    return text.includes('getupdates failed (409)') || text.includes('terminated by other getupdates request');
  }

  handlePollingConflict(error: unknown) {
    this.pollingConflictCount += 1;
    const backoffMs = Math.min(90_000, 5_000 * Math.max(1, this.pollingConflictCount));
    this.pollingPausedUntil = Date.now() + backoffMs;
    if (this.onPollingConflict) {
      this.onPollingConflict({
        conflictCount: this.pollingConflictCount,
        retryInMs: backoffMs,
        pausedUntil: this.pollingPausedUntil,
        error: String(error instanceof Error ? error.message : error),
      });
    }
    logger.warn(
      {
        err: error,
        conflictCount: this.pollingConflictCount,
        retryInMs: backoffMs,
      },
      'Telegram polling conflict detected; pausing polling',
    );
  }

  /**
   * Lightweight transport health snapshot used by status output.
   */
  getHealth() {
    const mode = config.get('telegram.webhookEnabled') ? 'webhook' : 'polling';
    const pausedForMs = Math.max(0, this.pollingPausedUntil - Date.now());
    return {
      mode,
      running: this.running,
      pollingConflictCount: this.pollingConflictCount,
      pollingPausedForMs: pausedForMs,
      state: pausedForMs > 0 ? 'degraded' : 'healthy',
    };
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isAllowedChatType(chatType: string | undefined): boolean {
    const allowGroupChats = Boolean(config.get('telegram.allowGroupChats'));
    if (allowGroupChats) {
      return true;
    }

    return chatType === 'private';
  }

  async stop() {
    this.running = false;

    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }

    if (this.webhookServer) {
      const server = this.webhookServer;
      await new Promise((resolve) => {
        server.close(resolve);
      });
      this.webhookServer = null;
    }
  }
}
