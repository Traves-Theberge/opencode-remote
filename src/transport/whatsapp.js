import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

export class WhatsAppTransport {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.client = null;
    this.connected = false;
    this.reconnectAttempts = 0;
  }

  async start() {
    const sessionPath = config.get('whatsapp.sessionPath');
    
    this.client = new Client({
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
        await this.handleIncomingMessage(message);
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

    this.client.on('message_ack', (message, ack) => {
      logger.debug({ ack, messageId: message.id._serialized }, 'Message ack');
    });

    logger.info('Starting WhatsApp client...');
    await this.client.initialize();
  }

  async generateQrDisplay(qr) {
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

  async handleIncomingMessage(message) {
    const from = message.from;
    const body = message.body?.trim() || '';
    
    logger.info({ from, body: body.slice(0, 50) }, 'Incoming message');

    if (!body.startsWith('@oc')) {
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

  async send(to, text) {
    if (!this.connected || !this.client) {
      logger.warn('Cannot send: client not connected');
      return;
    }

    const chatId = this.toChatId(to);
    const chunks = this.chunkMessage(text, 4096);
    
    for (const chunk of chunks) {
      await this.client.sendMessage(chatId, chunk);
    }
  }

  toChatId(value) {
    if (!value) {
      return value;
    }

    if (value.includes('@')) {
      return value;
    }

    const digits = value.replace(/\D/g, '');
    return `${digits}@c.us`;
  }

  chunkMessage(text, maxLength) {
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

  async sendToOwner(text) {
    const owner = config.get('security.ownerNumber');
    if (owner) {
      await this.send(owner, text);
    }
  }

  handleReconnect() {
    const maxAttempts = config.get('whatsapp.maxReconnectAttempts');
    const delay = config.get('whatsapp.reconnectDelay');

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
