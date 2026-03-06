import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface TelegramMediaPayload {
  kind: 'voice' | 'audio' | 'image';
  mimeType: string;
  filename: string;
  filePath: string;
  caption?: string;
}

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
  media?: TelegramMediaPayload;
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
    caption?: string;
    voice?: {
      file_id?: string;
      mime_type?: string;
      file_size?: number;
      duration?: number;
    };
    audio?: {
      file_id?: string;
      mime_type?: string;
      file_name?: string;
      file_size?: number;
      duration?: number;
    };
    photo?: Array<{
      file_id?: string;
      width?: number;
      height?: number;
      file_size?: number;
    }>;
    document?: {
      file_id?: string;
      mime_type?: string;
      file_name?: string;
      file_size?: number;
    };
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
      { text: 'Last', callback_data: 'oc:runs' },
      { text: 'Abort', callback_data: 'oc:abort' },
      { text: 'Help', callback_data: 'oc:help' },
    ],
  ],
};

export class TelegramTransport {
  onMessage: (event: TelegramInboundEvent) => Promise<string | null>;
  onDeadLetter: ((event: TelegramDeadLetter) => Promise<void>) | null;
  onPollingConflict:
    | ((event: {
        conflictCount: number;
        retryInMs: number;
        pausedUntil: number;
        error: string;
        recoveryBlockedForMs: number;
        lastRecoveryError: string;
      }) => void)
    | null;
  onPollingRecovered: ((event: { recoveredAt: number }) => void) | null;
  running: boolean;
  offset: number;
  pollingInFlight: boolean;
  pollLoopTask: Promise<void> | null;
  pollingRecoveryInFlight: boolean;
  lastPollingRecoveryAt: number;
  lastPollingConflictAt: number;
  lastPollingRecoveryError: string;
  recoveryBlockedUntil: number;
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
        recoveryBlockedForMs: number;
        lastRecoveryError: string;
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
    this.pollingInFlight = false;
    this.pollLoopTask = null;
    this.pollingRecoveryInFlight = false;
    this.lastPollingRecoveryAt = 0;
    this.lastPollingConflictAt = 0;
    this.lastPollingRecoveryError = '';
    this.recoveryBlockedUntil = 0;
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
      { command: 'last', description: 'Show latest run output' },
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
      await this.preparePollingSession();
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
    if (this.pollLoopTask) {
      return;
    }

    const intervalMs = Math.max(250, Number(config.get('telegram.pollingIntervalMs')) || 1200);
    const timeoutSec = Math.max(1, Number(config.get('telegram.pollingTimeoutSec')) || 30);
    logger.info({ intervalMs, timeoutSec }, 'Telegram polling loop starting');
    this.pollLoopTask = (async () => {
      while (this.running) {
        if (this.pollingInFlight) {
          await this.sleep(intervalMs);
          continue;
        }

        this.pollingInFlight = true;
        try {
          await this.pollOnce();
        } catch (error) {
          logger.warn({ err: error }, 'Telegram polling iteration failed');
          await this.sleep(intervalMs);
        } finally {
          this.pollingInFlight = false;
        }

        if (!this.running) {
          break;
        }

        await this.sleep(intervalMs);
      }
    })().finally(() => {
      this.pollLoopTask = null;
    });
  }

  async preparePollingSession() {
    logger.info('Preparing Telegram polling session state');
    await this.api('deleteWebhook', { drop_pending_updates: false }).catch((error) => {
      logger.warn({ err: error }, 'Failed to clear Telegram webhook before polling');
    });

    const maxAttempts = Math.max(1, Number(config.get('telegram.pollingCloseMaxAttempts')) || 2);
    let closed = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.api('close', {});
        closed = true;
        break;
      } catch (error) {
        const retryAfterSec = this.extractRetryAfterSeconds(error);
        const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : attempt * 1500;
        this.lastPollingRecoveryError = String(error instanceof Error ? error.message : error);
        if (retryAfterSec > 0) {
          this.recoveryBlockedUntil = Date.now() + waitMs;
        }
        logger.warn({ err: error, attempt, waitMs }, 'Telegram close failed during polling session prep');
        if (retryAfterSec > 0) {
          break;
        }
        await this.sleep(waitMs);
      }
    }

    if (closed) {
      this.lastPollingRecoveryError = '';
      this.recoveryBlockedUntil = 0;
      logger.info('Prepared Telegram polling session via close/deleteWebhook');
    } else {
      logger.warn(
        {
          blockedForMs: Math.max(0, this.recoveryBlockedUntil - Date.now()),
          lastError: this.lastPollingRecoveryError || null,
        },
        'Polling session prep could not close prior consumers; continuing with conflict backoff handling',
      );
    }
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
      if (this.pollingConflictCount > 0) {
        logger.info({ conflictCount: this.pollingConflictCount }, 'Telegram polling recovered');
      }
      this.pollingConflictCount = 0;
      this.pollingPausedUntil = 0;
      this.lastPollingRecoveryError = '';
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
    if (!this.isAllowedChatType(message?.chat?.type)) {
      logger.info({ chatType: message?.chat?.type }, 'Ignoring Telegram group message by policy');
      return;
    }

    const userId = String(message?.from?.id || '');
    const username = String(message?.from?.username || '');
    const chatId = String(message?.chat?.id || '');
    const text = String(message?.text || '').trim();
    const caption = String(message?.caption || '').trim();
    const media = await this.extractMediaPayload(message, updateId);
    const bodyText = text || caption || '';

    if (!bodyText && !media) {
      return;
    }

    const normalizedBody = this.normalizeBody(bodyText);
    const response = await this.onMessage({
      channel: 'telegram',
      from: chatId,
      body: normalizedBody,
      messageId: String(updateId || message?.message_id || ''),
      timestamp: message?.date || null,
      userId,
      username,
      chatId,
      media: media || undefined,
    });

    if (response) {
      await this.send(chatId, response);
    }
  }

  async handleCallbackUpdate(
    callback: NonNullable<TelegramUpdate['callback_query']>,
    updateId?: number,
  ) {
    const callbackId = String(callback?.id || '');
    const data = String(callback?.data || '');
    const userId = String(callback?.from?.id || '');
    const username = String(callback?.from?.username || '');
    const chatId = String(callback?.message?.chat?.id || '');

    if (!this.isAllowedChatType(callback?.message?.chat?.type)) {
      await this.answerCallbackSafe(callbackId, {
        text: 'Group chats are disabled for this bot',
        show_alert: false,
      });
      return;
    }

    await this.answerCallbackSafe(callbackId);

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

  async answerCallbackSafe(
    callbackId: string,
    options: { text?: string; show_alert?: boolean } = {},
  ): Promise<void> {
    if (!callbackId) {
      return;
    }

    try {
      await this.api('answerCallbackQuery', {
        callback_query_id: callbackId,
        ...options,
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (/query is too old|query ID is invalid/i.test(message)) {
        logger.debug({ callbackId }, 'Ignoring stale Telegram callback acknowledgement error');
        return;
      }
      throw error;
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
      last: '/last',
      runs: '/last',
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
      'oc:runs': '/last',
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

    const rendered = this.renderMarkdownV2(String(text || ''));
    const chunks = this.chunkMessage(rendered, 4096);
    const chunkDelayMs = Math.max(0, Number(config.get('telegram.sendChunkDelayMs')) || 1100);
    const maxRetries = Math.max(1, Number(config.get('telegram.sendMaxRetries')) || 3);
    const maxChunks = Math.max(2, Number(config.get('telegram.sendMaxChunks')) || 8);
    const deliveryChunks = this.limitDeliveryChunks(chunks, maxChunks);

    for (let chunkIndex = 0; chunkIndex < deliveryChunks.length; chunkIndex += 1) {
      const chunk = deliveryChunks[chunkIndex] || '';
      let sent = false;

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          await this.api('sendMessage', {
            chat_id: chatId,
            text: chunk,
            parse_mode: 'MarkdownV2',
            reply_markup: DEFAULT_KEYBOARD,
          });
          sent = true;
          break;
        } catch (error) {
          const retryAfterSec = this.extractRetryAfterSeconds(error);
          const transient = this.isTransientNetworkError(error);
          if ((retryAfterSec <= 0 && !transient) || attempt >= maxRetries) {
            throw error;
          }

          const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : 1200 * attempt;
          logger.warn(
            {
              err: error,
              chatId,
              attempt,
              waitMs,
              chunkIndex,
              chunkCount: deliveryChunks.length,
              transient,
            },
            'Telegram sendMessage failed; waiting before retry',
          );
          await this.sleep(waitMs);
        }
      }

      if (!sent) {
        throw new Error('Telegram sendMessage failed after retries');
      }

      if (chunkDelayMs > 0 && chunkIndex < deliveryChunks.length - 1) {
        await this.sleep(chunkDelayMs);
      }
    }
  }

  limitDeliveryChunks(chunks: string[], maxChunks: number): string[] {
    if (chunks.length <= maxChunks) {
      return chunks;
    }

    // Preserve first context chunks and final tail chunk, and insert one
    // truncation notice in the middle so users still get actionable output.
    const headCount = Math.max(1, maxChunks - 2);
    const omittedCount = Math.max(0, chunks.length - headCount - 1);
    const tail = chunks[chunks.length - 1] || '';
    const notice = this.renderMarkdownV2(
      `... output truncated in chat (${chunks.length} chunks total, ${omittedCount} omitted). Use /last to fetch the latest output again.`,
    );

    logger.warn(
      { originalChunkCount: chunks.length, deliveredChunkCount: headCount + 2 },
      'Telegram output chunk limit applied',
    );

    return [...chunks.slice(0, headCount), notice, tail];
  }

  chunkMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';

    const pushWithHardLimit = (value: string) => {
      const normalized = String(value || '');
      if (!normalized) {
        return;
      }

      // Telegram hard-rejects overlong payloads, so split even single long
      // lines into fixed-size slices as a final guard.
      let offset = 0;
      while (offset < normalized.length) {
        chunks.push(normalized.slice(offset, offset + maxLength));
        offset += maxLength;
      }
    };

    for (const line of lines) {
      const lineText = String(line || '');

      if (!current) {
        if (lineText.length <= maxLength) {
          current = lineText;
        } else {
          pushWithHardLimit(lineText);
          current = '';
        }
        continue;
      }

      const candidate = `${current}\n${lineText}`;
      if (candidate.length <= maxLength) {
        current = candidate;
        continue;
      }

      pushWithHardLimit(current);
      if (lineText.length <= maxLength) {
        current = lineText;
      } else {
        pushWithHardLimit(lineText);
        current = '';
      }
    }

    if (current) {
      pushWithHardLimit(current);
    }

    return chunks.filter(Boolean);
  }

  renderMarkdownV2(text: string): string {
    const codeBlocks: Array<{ lang: string; body: string }> = [];
    const withBlockPlaceholders = String(text || '').replace(
      /```([A-Za-z0-9_-]*)\n([\s\S]*?)```/g,
      (_whole, lang: string, body: string) => {
        const id = codeBlocks.length;
        codeBlocks.push({ lang: String(lang || ''), body: String(body || '') });
        return `@@BLOCK${id}@@`;
      },
    );

    const lines = withBlockPlaceholders.split('\n');

    return lines
      .map((line) => {
        const heading = this.parseHeading(line);
        if (heading) {
          return `*${this.escapeMarkdownV2Text(heading)}*`;
        }

        const inlineCodes: string[] = [];
        const withPlaceholders = line.replace(/`([^`\n]+)`/g, (_whole, code: string) => {
          const id = inlineCodes.length;
          inlineCodes.push(code);
          return `@@CODE${id}@@`;
        });

        const styles: Array<{ kind: 'bold' | 'italic'; text: string }> = [];
        const withStylePlaceholders = withPlaceholders
          .replace(/\*\*([^*\n][\s\S]*?)\*\*/g, (_whole, content: string) => {
            const id = styles.length;
            styles.push({ kind: 'bold', text: content });
            return `@@STYLE${id}@@`;
          })
          .replace(/__([^_\n][\s\S]*?)__/g, (_whole, content: string) => {
            const id = styles.length;
            styles.push({ kind: 'bold', text: content });
            return `@@STYLE${id}@@`;
          })
          .replace(/\*([^*\n][\s\S]*?)\*/g, (_whole, content: string) => {
            const id = styles.length;
            styles.push({ kind: 'italic', text: content });
            return `@@STYLE${id}@@`;
          })
          .replace(/_([^_\n][\s\S]*?)_/g, (_whole, content: string) => {
            const id = styles.length;
            styles.push({ kind: 'italic', text: content });
            return `@@STYLE${id}@@`;
          });

        let escaped = this.escapeMarkdownV2Text(withStylePlaceholders);
        escaped = escaped.replace(/@@CODE(\d+)@@/g, (_whole, idxText: string) => {
          const idx = Number(idxText);
          const code = inlineCodes[idx] || '';
          return `\`${this.escapeMarkdownV2Code(code)}\``;
        });

        escaped = escaped.replace(/@@STYLE(\d+)@@/g, (_whole, idxText: string) => {
          const idx = Number(idxText);
          const style = styles[idx] || { kind: 'bold' as const, text: '' };
          const content = this.escapeMarkdownV2Text(style.text);
          if (style.kind === 'italic') {
            return `_${content}_`;
          }
          return `*${content}*`;
        });

        escaped = escaped.replace(/@@BLOCK(\d+)@@/g, (_whole, idxText: string) => {
          const idx = Number(idxText);
          const block = codeBlocks[idx] || { lang: '', body: '' };
          const lang = String(block.lang || '').replace(/[^A-Za-z0-9_-]/g, '');
          const body = this.escapeMarkdownV2Code(String(block.body || '').replace(/\n$/, ''));
          return `\`\`\`${lang}\n${body}\n\`\`\``;
        });

        if (this.shouldBoldLine(line)) {
          return `*${escaped}*`;
        }

        return escaped;
      })
      .join('\n');
  }

  parseHeading(line: string): string {
    const match = /^#{1,6}\s+(.+)$/.exec(String(line || '').trim());
    return match ? String(match[1] || '') : '';
  }

  shouldBoldLine(line: string): boolean {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      return false;
    }

    if (/^🟢 OpenCode Remote · .+ · \d{2}:\d{2}$/.test(trimmed)) {
      return true;
    }

    return ['Next', 'Try', 'Reply with', 'Recent run IDs'].includes(trimmed);
  }

  escapeMarkdownV2Text(text: string): string {
    return String(text || '').replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  escapeMarkdownV2Code(text: string): string {
    return String(text || '').replace(/([`\\])/g, '\\$1');
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

  async extractMediaPayload(
    message: NonNullable<TelegramUpdate['message']>,
    updateId?: number,
  ): Promise<TelegramMediaPayload | null> {
    // Resolve inbound Telegram media into a local temp file descriptor for app-level handling.
    if (!config.get('media.enabled')) {
      return null;
    }

    if (config.get('media.voiceEnabled')) {
      const voiceId = String(message?.voice?.file_id || '');
      const audioId = String(message?.audio?.file_id || '');
      if (voiceId || audioId) {
        const fileId = voiceId || audioId;
        const mimeType = String(message?.voice?.mime_type || message?.audio?.mime_type || 'audio/ogg');
        const extension = this.extensionForMime(mimeType, 'ogg');
        const localPath = await this.downloadTelegramFileToTemp(fileId, extension, updateId);
        return {
          kind: voiceId ? 'voice' : 'audio',
          mimeType,
          filename: String(message?.audio?.file_name || `telegram-audio-${Date.now()}.${extension}`),
          filePath: localPath,
          caption: String(message?.caption || ''),
        };
      }
    }

    if (config.get('media.imageEnabled')) {
      const photo = this.pickLargestPhoto(message?.photo || []);
      const documentImageId =
        String(message?.document?.mime_type || '').startsWith('image/')
          ? String(message?.document?.file_id || '')
          : '';
      const fileId = String(photo?.file_id || documentImageId || '');
      if (fileId) {
        const mimeType = photo
          ? 'image/jpeg'
          : String(message?.document?.mime_type || 'image/jpeg');
        const extension = this.extensionForMime(mimeType, 'jpg');
        const localPath = await this.downloadTelegramFileToTemp(fileId, extension, updateId);
        return {
          kind: 'image',
          mimeType,
          filename: String(message?.document?.file_name || `telegram-image-${Date.now()}.${extension}`),
          filePath: localPath,
          caption: String(message?.caption || ''),
        };
      }
    }

    return null;
  }

  pickLargestPhoto(
    photos: Array<{ file_id?: string; width?: number; height?: number; file_size?: number }>,
  ): { file_id?: string; width?: number; height?: number; file_size?: number } | null {
    if (!Array.isArray(photos) || photos.length === 0) {
      return null;
    }
    const sorted = [...photos].sort((a, b) => Number(b.file_size || 0) - Number(a.file_size || 0));
    return sorted[0] || null;
  }

  extensionForMime(mimeType: string, fallback: string): string {
    const normalized = String(mimeType || '').toLowerCase();
    const map: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[normalized] || fallback;
  }

  async downloadTelegramFileToTemp(fileId: string, extension: string, updateId?: number): Promise<string> {
    // Download through Telegram file API and persist into configured temp path.
    const fileInfo = (await this.api('getFile', { file_id: fileId })) as { result?: { file_path?: string } };
    const filePath = String(fileInfo?.result?.file_path || '');
    if (!filePath) {
      throw new Error('Telegram getFile returned no file_path');
    }

    const token = String(config.get('telegram.botToken') || '').trim();
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Telegram file download failed (${response.status})`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const maxBytes = Math.max(100_000, Number(config.get('telegram.mediaDownloadMaxBytes')) || 15_000_000);
    if (bytes.length > maxBytes) {
      throw new Error(`Telegram media too large (${bytes.length} > ${maxBytes})`);
    }

    const tempRoot = String(config.get('media.tempPath') || './data/media');
    mkdirSync(tempRoot, { recursive: true });
    const safeId = String(updateId || fileId).replace(/[^A-Za-z0-9_-]/g, '');
    const output = path.resolve(tempRoot, `tg-${Date.now()}-${safeId}.${extension}`);
    writeFileSync(output, bytes);
    return output;
  }

  isPollingConflict(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error).toLowerCase();
    return text.includes('getupdates failed (409)') || text.includes('terminated by other getupdates request');
  }

  handlePollingConflict(error: unknown) {
    this.pollingConflictCount += 1;
    this.lastPollingConflictAt = Date.now();
    const backoffMs = Math.min(90_000, 5_000 * Math.max(1, this.pollingConflictCount));
    this.pollingPausedUntil = Date.now() + backoffMs;
    if (this.onPollingConflict) {
      this.onPollingConflict({
        conflictCount: this.pollingConflictCount,
        retryInMs: backoffMs,
        pausedUntil: this.pollingPausedUntil,
        error: String(error instanceof Error ? error.message : error),
        recoveryBlockedForMs: Math.max(0, this.recoveryBlockedUntil - Date.now()),
        lastRecoveryError: this.lastPollingRecoveryError,
      });
    }
    logger.warn(
      {
        err: error,
        conflictCount: this.pollingConflictCount,
        retryInMs: backoffMs,
        offset: this.offset,
      },
      'Telegram polling conflict detected; pausing polling',
    );

    if (this.pollingConflictCount >= 3) {
      void this.attemptPollingRecovery();
    }
  }

  async attemptPollingRecovery() {
    const now = Date.now();
    if (this.pollingRecoveryInFlight) {
      return;
    }
    const minIntervalMs = Math.max(1000, Number(config.get('telegram.pollingRecoveryMinIntervalMs')) || 60_000);
    if (now - this.lastPollingRecoveryAt < minIntervalMs) {
      return;
    }

    if (now < this.recoveryBlockedUntil) {
      return;
    }

    this.pollingRecoveryInFlight = true;
    this.lastPollingRecoveryAt = now;
    try {
      await this.api('deleteWebhook', { drop_pending_updates: false }).catch(() => null);

      let closed = false;
      const maxAttempts = Math.max(1, Number(config.get('telegram.pollingCloseMaxAttempts')) || 2);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.api('close', {});
          closed = true;
          break;
        } catch (error) {
          const retryAfterSec = this.extractRetryAfterSeconds(error);
          const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : attempt * 1500;
          this.lastPollingRecoveryError = String(error instanceof Error ? error.message : error);
          if (retryAfterSec > 0) {
            this.recoveryBlockedUntil = Date.now() + waitMs;
          }
          logger.warn(
            { err: error, attempt, waitMs },
            'Telegram close failed during polling recovery; retrying',
          );
          if (retryAfterSec > 0) {
            break;
          }
          await this.sleep(waitMs);
        }
      }

      if (closed) {
        this.lastPollingRecoveryError = '';
        this.recoveryBlockedUntil = 0;
        logger.warn('Telegram polling recovery requested via close/deleteWebhook');
      }
      this.pollingPausedUntil = Date.now() + 5000;
    } finally {
      this.pollingRecoveryInFlight = false;
    }
  }

  extractRetryAfterSeconds(error: unknown): number {
    const message = String(error instanceof Error ? error.message : error);
    const match = /"retry_after"\s*:\s*(\d+)/i.exec(message);
    return match ? Number(match[1]) : 0;
  }

  isTransientNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = String(error.message || '').toLowerCase();
    if (message.includes('econnreset') || message.includes('etimedout') || message.includes('fetch failed')) {
      return true;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const causeMessage = String(cause.message || '').toLowerCase();
      if (causeMessage.includes('econnreset') || causeMessage.includes('etimedout')) {
        return true;
      }
    }

    return false;
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
      recoveryBlockedForMs: Math.max(0, this.recoveryBlockedUntil - Date.now()),
      lastPollingConflictAt: this.lastPollingConflictAt,
      lastPollingRecoveryError: this.lastPollingRecoveryError,
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
    this.pollingInFlight = false;

    if (this.pollLoopTask) {
      try {
        await this.pollLoopTask;
      } catch {
        // ignore shutdown errors
      }
      this.pollLoopTask = null;
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
