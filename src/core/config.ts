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
    webhookMaxBodyBytes: 1_000_000,
    pollingConflictAlertThreshold: 3,
    pollingConflictAlertCooldownMs: 300_000,
    pollingRecoveryMinIntervalMs: 60_000,
    pollingCloseMaxAttempts: 2,
    sendChunkDelayMs: 1100,
    sendMaxRetries: 3,
    sendMaxChunks: 8,
    mediaDownloadMaxBytes: 15_000_000,
  },
  media: {
    enabled: true,
    imageEnabled: true,
    voiceEnabled: true,
    tempPath: './data/media',
  },
  asr: {
    enabled: true,
    provider: 'transformers-local',
    model: 'openai/whisper-medium',
    pythonBin: 'python3',
    timeoutMs: 180_000,
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
    requireEnvTokens: false,
    ingressPerSenderPerMinute: 30,
    ingressGlobalPerMinute: 240,
    ingressBurst: 10,
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

function keyToEnvKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
}

function parseBooleanEnv(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  return null;
}

class Config {
  private store: Conf<Record<string, unknown>>;

  constructor() {
    this.store = new Conf({
      projectName: 'opencode-remote',
      defaults,
    }) as unknown as Conf<Record<string, unknown>>;
  }

  get(key: string): unknown {
    const envOverride = this.getEnvOverride(key);
    if (envOverride !== undefined) {
      return envOverride;
    }
    return this.store.get(key);
  }

  getPersisted(key: string): unknown {
    return this.store.get(key);
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  hasEnvOverride(key: string): boolean {
    return process.env[keyToEnvKey(key)] !== undefined;
  }

  getAllowedNumbers() {
    const owner = this.normalizePhone(this.get('security.ownerNumber'));
    const allowed = ((this.get('security.allowedNumbers') as string[] | undefined) || []).map((number) =>
      this.normalizePhone(number),
    );
    const all = new Set([owner, ...allowed]);
    all.delete('');
    return Array.from(all);
  }

  normalizePhone(number: unknown): string {
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

  isValidPhone(number: unknown): boolean {
    const normalized = this.normalizePhone(number);
    return /^\+[1-9]\d{7,14}$/.test(normalized);
  }

  addAllowedNumber(number: unknown): void {
    const normalized = this.normalizePhone(number);
    const allowed = ((this.get('security.allowedNumbers') as string[] | undefined) || []).map((entry) =>
      this.normalizePhone(entry),
    );

    if (normalized && !allowed.includes(normalized)) {
      allowed.push(normalized);
      this.set('security.allowedNumbers', allowed);
    }
  }

  removeAllowedNumber(number: unknown): void {
    const normalized = this.normalizePhone(number);
    const allowed = ((this.get('security.allowedNumbers') as string[] | undefined) || []).map((entry) =>
      this.normalizePhone(entry),
    );
    const filtered = allowed.filter((entry) => entry !== normalized);
    this.set('security.allowedNumbers', filtered);
  }

  isAllowed(number: unknown): boolean {
    return this.getAllowedNumbers().includes(this.normalizePhone(number));
  }

  isOwner(number: unknown): boolean {
    return (
      this.normalizePhone(this.get('security.ownerNumber')) ===
      this.normalizePhone(number)
    );
  }

  /**
   * Resolve environment override for a dotted config key.
   *
   * Examples:
   * - `telegram.botToken` -> `TELEGRAM_BOT_TOKEN`
   * - `storage.dbPath` -> `STORAGE_DB_PATH`
   */
  private getEnvOverride(key: string): unknown {
    const envKey = keyToEnvKey(key);
    const raw = process.env[envKey];
    if (raw === undefined) {
      return undefined;
    }

    const defaultValue = this.resolveDefaultValue(key);
    if (typeof defaultValue === 'boolean') {
      const parsed = parseBooleanEnv(raw);
      return parsed === null ? defaultValue : parsed;
    }

    if (typeof defaultValue === 'number') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    if (Array.isArray(defaultValue)) {
      if (raw.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : defaultValue;
        } catch {
          return defaultValue;
        }
      }
      return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    if (defaultValue && typeof defaultValue === 'object' && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : defaultValue;
      } catch {
        return defaultValue;
      }
    }

    return raw;
  }

  /**
   * Look up default value shape for type-coerced env parsing.
   */
  private resolveDefaultValue(key: string): unknown {
    const segments = key.split('.');
    let cursor: unknown = defaults;

    for (const segment of segments) {
      if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }

    return cursor;
  }
}

export const config = new Config();
