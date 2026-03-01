import http from 'node:http';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

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
  constructor(onMessage, options = {}) {
    this.onMessage = onMessage;
    this.onDeadLetter = options.onDeadLetter || null;
    this.running = false;
    this.offset = 0;
    this.poller = null;
    this.webhookServer = null;
  }

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

    if (config.get('telegram.webhookEnabled')) {
      await this.startWebhook();
    }

    if (config.get('telegram.pollingEnabled')) {
      this.startPolling();
    }

    logger.info('Telegram transport started');
  }

  async startWebhook() {
    const webhookUrl = config.get('telegram.webhookUrl');
    if (!webhookUrl) {
      logger.warn('telegram.webhookEnabled=true but webhookUrl is empty; skipping webhook mode');
      return;
    }

    const secret = config.get('telegram.webhookSecret') || '';
    const host = config.get('telegram.webhookHost') || '0.0.0.0';
    const port = Number(config.get('telegram.webhookPort')) || 4097;
    const path = config.get('telegram.webhookPath') || '/telegram/webhook';

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
      for await (const chunk of req) {
        chunks.push(chunk);
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

    await new Promise((resolve) => {
      this.webhookServer.listen(port, host, resolve);
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

  async pollOnce() {
    if (!this.running) {
      return;
    }

    const timeout = Number(config.get('telegram.pollingTimeoutSec')) || 30;
    const response = await this.api('getUpdates', {
      offset: this.offset,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    });

    const updates = response?.result || [];
    for (const update of updates) {
      this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
      await this.processUpdateWithRetry(update);
    }
  }

  async processUpdateWithRetry(update) {
    const maxRetries = Number(config.get('whatsapp.messageMaxRetries')) || 3;
    const retryDelayMs = Number(config.get('whatsapp.messageRetryDelayMs')) || 1500;

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

  async processUpdate(update) {
    if (update?.message) {
      await this.handleMessageUpdate(update.message);
      return;
    }

    if (update?.callback_query) {
      await this.handleCallbackUpdate(update.callback_query);
    }
  }

  async handleMessageUpdate(message) {
    const text = String(message?.text || '').trim();
    if (!text) {
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
      messageId: String(message?.message_id || ''),
      timestamp: message?.date || null,
      userId,
      username,
      chatId,
    });

    if (response) {
      await this.send(chatId, response);
    }
  }

  async handleCallbackUpdate(callback) {
    const callbackId = callback?.id;
    const data = String(callback?.data || '');
    const userId = String(callback?.from?.id || '');
    const username = String(callback?.from?.username || '');
    const chatId = String(callback?.message?.chat?.id || '');

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
      messageId: String(callback?.message?.message_id || callbackId || ''),
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

  normalizeBody(text) {
    if (!text) {
      return '';
    }

    if (text.toLowerCase().startsWith('@oc')) {
      return text;
    }

    if (text.startsWith('/')) {
      return `@oc ${text.replace('/session_list', '/session list').replace('/session_new', '/session new')}`;
    }

    return `@oc ${text}`;
  }

  callbackToCommand(data) {
    const mapped = {
      'oc:status': '@oc /status',
      'oc:session_list': '@oc /session list',
      'oc:diff': '@oc /diff',
      'oc:runs': '@oc /runs',
      'oc:help': '@oc /help',
      'oc:abort': '@oc /abort',
    };

    if (mapped[data]) {
      return mapped[data];
    }

    const permissionMatch = /^oc:perm:([A-Za-z0-9_-]+):(once|always|reject)$/.exec(data);
    if (permissionMatch) {
      const [, permissionId, response] = permissionMatch;
      return `@oc /permission ${permissionId} ${response}`;
    }

    return null;
  }

  async send(to, text) {
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

  chunkMessage(text, maxLength) {
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

  async moveToDeadLetter(update, error, attempts) {
    const sender =
      String(update?.message?.from?.id || update?.callback_query?.from?.id || '') || null;
    const body =
      update?.message?.text || update?.callback_query?.data || JSON.stringify(update || {});

    const payload = {
      channel: 'telegram',
      messageId: String(update?.update_id || ''),
      sender,
      body,
      error: String(error?.message || error),
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

  async api(method, body) {
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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async stop() {
    this.running = false;

    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }

    if (this.webhookServer) {
      await new Promise((resolve) => {
        this.webhookServer.close(resolve);
      });
      this.webhookServer = null;
    }
  }
}
