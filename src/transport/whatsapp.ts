import whatsappWeb from 'whatsapp-web.js';
import type { Client } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface IncomingEvent {
  from: string;
  body: string;
  messageId: string | null;
  timestamp: number | null;
}

interface DeadLetterPayload {
  channel: string;
  messageId: string | null;
  sender: string | null;
  body: string;
  error: string;
  attempts: number;
  payload: { timestamp: number | null };
}

const { Client: WhatsAppClient, LocalAuth } = whatsappWeb as {
  Client: new (options: {
    authStrategy: unknown;
    puppeteer: { headless: boolean; args: string[] };
  }) => Client;
  LocalAuth: new (options: { dataPath: string }) => unknown;
};

export class WhatsAppTransport {
  onMessage: (event: IncomingEvent) => Promise<string | null>;
  onDeadLetter: ((event: DeadLetterPayload) => Promise<void>) | null;
  client: Client | null;
  connected: boolean;
  reconnectAttempts: number;

  constructor(
    onMessage: (event: IncomingEvent) => Promise<string | null>,
    options: { onDeadLetter?: (event: DeadLetterPayload) => Promise<void> } = {},
  ) {
    this.onMessage = onMessage;
    this.onDeadLetter = options.onDeadLetter || null;
    this.client = null;
    this.connected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Start WhatsApp web transport and register lifecycle/message handlers.
   */
  async start() {
    const sessionPath = String(config.get('whatsapp.sessionPath') || './.wwebjs_auth');
    
    this.client = new WhatsAppClient({
      authStrategy: new LocalAuth({
        dataPath: sessionPath,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', async (qr) => {
      logger.info('📱 Scan this QR code with WhatsApp:');
      console.log('\n' + '='.repeat(50));
      console.log('  SCAN TO PAIR OPENCODE REMOTE');
      console.log('='.repeat(50));
      await this.generateQrDisplay(qr);
      console.log('='.repeat(50) + '\n');
    });

    this.client.on('ready', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('✅ WhatsApp client ready');
      this.sendToOwner('🚀 OpenCode Remote is online and ready!');
    });

    this.client.on('message', async (message) => {
      try {
        await this.handleIncomingMessageWithRetry(message);
      } catch (error) {
        logger.error({ err: error }, 'Error handling message');
      }
    });

    this.client.on('disconnected', (reason) => {
      this.connected = false;
      logger.warn({ reason }, 'WhatsApp disconnected');
      this.handleReconnect();
    });

    this.client.on('auth_failure', (error) => {
      logger.error({ err: error }, 'WhatsApp auth failure');
    });

    this.client.on('message_ack', (message: unknown, ack: unknown) => {
      const messageId =
        typeof message === 'object' &&
        message !== null &&
        'id' in message &&
        typeof (message as { id?: { _serialized?: string } }).id?._serialized === 'string'
          ? (message as { id: { _serialized: string } }).id._serialized
          : null;
      logger.debug({ ack, messageId }, 'Message ack');
    });

    logger.info('Starting WhatsApp client...');
    await this.client.initialize();
  }

  async generateQrDisplay(qr: string): Promise<void> {
    try {
      const rendered = await QRCode.toString(qr, {
        type: 'terminal',
        small: true,
      });
      console.log(rendered);
    } catch {
      console.log(qr);
    }
  }

  /**
   * Handle a single inbound WhatsApp message and dispatch response.
   */
  async handleIncomingMessage(message: { from: string; body?: string; id?: { _serialized?: string }; timestamp?: number }) {
    const from = message.from;
    const body = message.body?.trim() || '';
    
    logger.info({ from, body: body.slice(0, 50) }, 'Incoming message');

    if (!body) {
      return;
    }

    const response = await this.onMessage({
      from,
      body,
      messageId: message.id?._serialized || null,
      timestamp: message.timestamp || null,
    });
    
    if (response) {
      await this.send(from, response);
    }
  }

  async handleIncomingMessageWithRetry(message: { from: string; body?: string; id?: { _serialized?: string }; timestamp?: number }) {
    const maxRetries = Number(config.get('whatsapp.messageMaxRetries')) || 3;
    const retryDelayMs = Number(config.get('whatsapp.messageRetryDelayMs')) || 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.handleIncomingMessage(message);
        return;
      } catch (error) {
        const isLast = attempt === maxRetries;
        logger.warn(
          {
            err: error,
            attempt,
            maxRetries,
            messageId: message?.id?._serialized || null,
          },
          'Incoming message handling attempt failed',
        );

        if (isLast) {
          await this.moveToDeadLetter(message, error, attempt);
          return;
        }

        await this.sleep(retryDelayMs * attempt);
      }
    }
  }

  async moveToDeadLetter(
    message: { from: string; body?: string; id?: { _serialized?: string }; timestamp?: number },
    error: unknown,
    attempts: number,
  ) {
    const payload = {
      channel: 'whatsapp',
      messageId: message?.id?._serialized || null,
      sender: message?.from || null,
      body: message?.body || '',
      error: String(error instanceof Error ? error.message : error),
      attempts,
      payload: {
        timestamp: message?.timestamp || null,
      },
    };

    if (this.onDeadLetter) {
      try {
        await this.onDeadLetter(payload);
      } catch (callbackError) {
        logger.error({ err: callbackError }, 'Dead-letter callback failed');
      }
    }

    logger.error(
      {
        messageId: payload.messageId,
        sender: payload.sender,
        attempts,
      },
      'Message moved to dead-letter queue',
    );
  }

  async send(to: string, text: string) {
    if (!this.connected || !this.client) {
      logger.warn('Cannot send: client not connected');
      return;
    }

    const chatId = this.toChatId(to);
    if (!chatId) {
      logger.warn({ to }, 'Cannot send: invalid chat ID');
      return;
    }

    const chunks = this.chunkMessage(text, 4096);
    
    for (const chunk of chunks) {
      await this.client.sendMessage(chatId, chunk);
    }
  }

  toChatId(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value.includes('@')) {
      return value;
    }

    const digits = value.replace(/\D/g, '');
    if (!digits) {
      return null;
    }

    return `${digits}@c.us`;
  }

  chunkMessage(text: string, maxLength: number): string[] {
    const chunks = [];
    const lines = text.split('\n');
    let current = '';

    for (const line of lines) {
      if ((current + '\n' + line).length <= maxLength) {
        current += (current ? '\n' : '') + line;
      } else {
        if (current) chunks.push(current);
        current = line;
      }
    }
    if (current) chunks.push(current);
    
    return chunks;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendToOwner(text: string) {
    const owner = String(config.get('security.ownerNumber') || '');
    if (owner) {
      await this.send(owner, text);
    }
  }

  handleReconnect() {
    const maxAttempts = Number(config.get('whatsapp.maxReconnectAttempts')) || 5;
    const delay = Number(config.get('whatsapp.reconnectDelay')) || 5000;

    if (this.reconnectAttempts < maxAttempts) {
      this.reconnectAttempts++;
      logger.info({ attempt: this.reconnectAttempts, maxAttempts }, 'Attempting reconnect');
      
      setTimeout(async () => {
        try {
          await this.client?.initialize();
        } catch (error) {
          logger.error({ err: error }, 'Reconnect failed');
        }
      }, delay * this.reconnectAttempts);
    } else {
      logger.error('Max reconnection attempts reached');
    }
  }

  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.connected = false;
      logger.info('WhatsApp client stopped');
    }
  }

  getClient() {
    return this.client;
  }

  isConnected() {
    return this.connected;
  }
}
