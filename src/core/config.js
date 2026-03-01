import Conf from 'conf';

const defaults = {
  whatsapp: {
    enabled: true,
    sessionPath: './.wwebjs_auth',
    qrTimeout: 120000,
    reconnectDelay: 5000,
    maxReconnectAttempts: 5,
    messageMaxRetries: 3,
    messageRetryDelayMs: 1500,
  },
  telegram: {
    enabled: true,
    botToken: '',
    ownerUserId: '',
    allowGroupChats: false,
    pollingEnabled: true,
    pollingIntervalMs: 1200,
    pollingTimeoutSec: 30,
    messageMaxRetries: 3,
    messageRetryDelayMs: 1500,
    webhookEnabled: false,
    webhookUrl: '',
    webhookSecret: '',
    webhookHost: '0.0.0.0',
    webhookPort: 4097,
    webhookPath: '/telegram/webhook',
  },
  opencode: {
    serverUrl: 'http://localhost:4096',
    sessionId: null,
  },
  storage: {
    dbPath: './data/opencode-remote.db',
  },
  security: {
    inactivityTimeout: 15 * 60 * 1000,
    maxConfirmAge: 5 * 60 * 1000,
    sessionMaxAge: 24 * 60 * 60 * 1000,
    sessionStaleTimeout: 2 * 60 * 60 * 1000,
    ownerNumber: '',
    allowedNumbers: [],
  },
  commands: {
    dangerousDenyList: [
      'rm -rf /',
      'rm -rf ~',
      'dd if=',
      ':(){:|:&};:',
      'curl.*\\|bash',
      'wget.*\\|sh',
    ],
  },
};

class Config {
  constructor() {
    this.store = new Conf({
      projectName: 'opencode-remote',
      defaults,
    });
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
  }

  delete(key) {
    this.store.delete(key);
  }

  getAllowedNumbers() {
    const owner = this.normalizePhone(this.get('security.ownerNumber'));
    const allowed = (this.get('security.allowedNumbers') || []).map((number) =>
      this.normalizePhone(number),
    );
    const all = new Set([owner, ...allowed]);
    all.delete(undefined);
    all.delete('');
    return Array.from(all);
  }

  normalizePhone(number) {
    if (!number || typeof number !== 'string') {
      return '';
    }

    const stripped = number
      .replace(/@c\.us$/i, '')
      .replace(/^whatsapp:/i, '')
      .replace(/[^\d+]/g, '');

    if (stripped.startsWith('+')) {
      return stripped;
    }

    return stripped ? `+${stripped}` : '';
  }

  isValidPhone(number) {
    const normalized = this.normalizePhone(number);
    return /^\+[1-9]\d{7,14}$/.test(normalized);
  }

  addAllowedNumber(number) {
    const normalized = this.normalizePhone(number);
    const allowed = (this.get('security.allowedNumbers') || []).map((entry) =>
      this.normalizePhone(entry),
    );

    if (normalized && !allowed.includes(normalized)) {
      allowed.push(normalized);
      this.set('security.allowedNumbers', allowed);
    }
  }

  removeAllowedNumber(number) {
    const normalized = this.normalizePhone(number);
    const allowed = (this.get('security.allowedNumbers') || []).map((entry) =>
      this.normalizePhone(entry),
    );
    const filtered = allowed.filter((entry) => entry !== normalized);
    this.set('security.allowedNumbers', filtered);
  }

  isAllowed(number) {
    return this.getAllowedNumbers().includes(this.normalizePhone(number));
  }

  isOwner(number) {
    return (
      this.normalizePhone(this.get('security.ownerNumber')) ===
      this.normalizePhone(number)
    );
  }
}

export const config = new Config();
