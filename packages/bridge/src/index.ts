import fs from 'node:fs';
import path from 'node:path';
import Conf from 'conf';
import Database from 'better-sqlite3';

export interface RuntimeConfig {
  storageDbPath: string;
  ownerNumber: string;
  telegramEnabled: boolean;
  telegramMode: 'polling' | 'webhook' | 'disabled';
  telegramWebhookUrl: string;
  telegramPollingState: 'healthy' | 'degraded' | 'unknown';
  telegramPollingConflictCount: number;
  telegramPollingRetryInMs: number;
}

export interface AuditRow {
  id: number;
  event_type: string;
  payload_json: string;
  created_at: number;
}

export interface DeadLetterRow {
  id: number;
  channel: string;
  message_id: string | null;
  sender: string | null;
  body: string | null;
  error: string;
  attempts: number;
  created_at: number;
}

export interface RunRow {
  run_id: string;
  phone: string;
  command_type: string;
  created_at: number;
}

const defaults = {
  storage: {
    dbPath: './data/opencode-remote.db',
  },
  security: {
    ownerNumber: '',
  },
  telegram: {
    enabled: true,
    pollingEnabled: true,
    webhookEnabled: false,
    webhookUrl: '',
    botToken: '',
  },
};

export interface FlowInsights {
  stageCounts: Record<string, number>;
  transitions: Record<string, number>;
  latest: Array<{ at: number; stage: string; eventType: string; summary: string }>;
}

export type TaskId =
  | 'status'
  | 'logs'
  | 'flow'
  | 'deadletters'
  | 'db.info'
  | 'db.vacuum'
  | 'db.prune'
  | 'security.rotate-token-check';

interface TelegramPollingHealth {
  state: 'healthy' | 'degraded' | 'unknown';
  conflictCount: number;
  retryInMs: number;
}

export interface TaskRequest {
  id: TaskId;
  args?: Record<string, string | number | boolean | undefined>;
}

export interface TaskResult {
  id: TaskId;
  title: string;
  lines: string[];
}

export interface TaskDefinition {
  id: TaskId;
  label: string;
  description: string;
  args?: string[];
}

/** Validate E.164 phone value for owner/setup workflows. */
function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(String(value || '').trim());
}

/** Validate HTTPS URL for Telegram webhook mode. */
function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikePlaceholderToken(token: string): boolean {
  const normalized = String(token || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes('replace-with-real-token') ||
    normalized.includes('your-token') ||
    normalized.includes('example') ||
    normalized.includes('changeme') ||
    normalized === '123456:abc'
  );
}

/** Map audit event types to high-level flow stages. */
function normalizeStage(eventType: string): string {
  if (eventType === 'message.incoming') {
    return 'incoming';
  }
  if (eventType === 'access.denied') {
    return 'access_denied';
  }
  if (eventType === 'command.responded') {
    return 'responded';
  }
  if (eventType === 'command.blocked') {
    return 'blocked';
  }
  if (eventType === 'command.executed') {
    return 'executed';
  }
  if (eventType === 'transport.dead_letter') {
    return 'dead_letter';
  }
  if (eventType === 'permission.updated') {
    return 'permission';
  }
  return 'other';
}

/** Build stage/transition summaries for CLI/TUI flow views. */
export function buildFlowInsights(rows: AuditRow[], latestLimit = 18): FlowInsights {
  const sorted = [...rows].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at - b.created_at;
    }
    return a.id - b.id;
  });
  const stageCounts: Record<string, number> = {};
  const transitions: Record<string, number> = {};
  const latest: Array<{ at: number; stage: string; eventType: string; summary: string }> = [];

  let previousStage: string | null = null;

  for (const row of sorted) {
    const stage = normalizeStage(row.event_type);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;

    if (previousStage) {
      const key = `${previousStage}->${stage}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }
    previousStage = stage;

    let summary: string;
    try {
      const payload = JSON.parse(row.payload_json) as { sender?: string; command?: string; reason?: string };
      summary = [payload.sender, payload.command, payload.reason].filter(Boolean).join(' | ');
    } catch {
      summary = '';
    }

    latest.push({
      at: row.created_at,
      stage,
      eventType: row.event_type,
      summary,
    });
  }

  return {
    stageCounts,
    transitions,
    latest: latest.slice(-Math.max(1, latestLimit)).reverse(),
  };
}

/**
 * Shared operational bridge used by CLI and TUI.
 *
 * Provides config management, DB insights, and maintenance task execution.
 */
export class OpsBridge {
  private store: Conf<Record<string, unknown>>;
  private dbPathOverride: string | null;

  constructor(options: { projectName?: string; dbPathOverride?: string } = {}) {
    this.dbPathOverride = options.dbPathOverride || null;
    this.store = new Conf({
      projectName: options.projectName || 'opencode-remote',
      defaults,
    }) as unknown as Conf<Record<string, unknown>>;
  }

  /** Read effective runtime config summary for operator surfaces. */
  getRuntimeConfig(): RuntimeConfig {
    const pollingEnabled = Boolean(this.store.get('telegram.pollingEnabled'));
    const webhookEnabled = Boolean(this.store.get('telegram.webhookEnabled'));

    let telegramMode: RuntimeConfig['telegramMode'] = 'disabled';
    if (this.store.get('telegram.enabled')) {
      telegramMode = webhookEnabled ? 'webhook' : pollingEnabled ? 'polling' : 'disabled';
    }

    const polling = this.getTelegramPollingHealth();

    return {
      storageDbPath: String(this.store.get('storage.dbPath') || './data/opencode-remote.db'),
      ownerNumber: String(this.store.get('security.ownerNumber') || ''),
      telegramEnabled: Boolean(this.store.get('telegram.enabled')),
      telegramMode,
      telegramWebhookUrl: String(this.store.get('telegram.webhookUrl') || ''),
      telegramPollingState: polling.state,
      telegramPollingConflictCount: polling.conflictCount,
      telegramPollingRetryInMs: polling.retryInMs,
    };
  }

  /** Apply onboarding setup values with optional dry-run validation. */
  applySetup(
    values: {
    ownerNumber: string;
    telegramEnabled: boolean;
    telegramBotToken: string;
    telegramMode: 'polling' | 'webhook';
    telegramWebhookUrl?: string;
    telegramWebhookSecret?: string;
    },
    options: { dryRun?: boolean } = {},
  ): void {
    const ownerNumber = values.ownerNumber.trim();
    if (!isValidE164(ownerNumber)) {
      throw new Error('Owner number must be a valid E.164 value (example: +15551234567).');
    }

    if (values.telegramEnabled) {
      const token = values.telegramBotToken.trim();
      if (!token) {
        throw new Error('Telegram bot token is required when Telegram is enabled.');
      }

      if (values.telegramMode === 'webhook') {
        const webhookUrl = String(values.telegramWebhookUrl || '').trim();
        const webhookSecret = String(values.telegramWebhookSecret || '').trim();
        if (!isValidHttpsUrl(webhookUrl)) {
          throw new Error('Webhook mode requires a valid HTTPS webhook URL.');
        }
        if (!webhookSecret) {
          throw new Error('Webhook mode requires a non-empty webhook secret.');
        }
      }
    }

    if (options.dryRun) {
      return;
    }

    this.store.set('security.ownerNumber', ownerNumber);
    this.store.set('telegram.enabled', values.telegramEnabled);
    this.store.set('telegram.botToken', String(values.telegramBotToken || '').trim());

    const isWebhook = values.telegramMode === 'webhook';
    this.store.set('telegram.webhookEnabled', isWebhook);
    this.store.set('telegram.pollingEnabled', !isWebhook);

    if (isWebhook) {
      this.store.set('telegram.webhookUrl', String(values.telegramWebhookUrl || '').trim());
      this.store.set('telegram.webhookSecret', String(values.telegramWebhookSecret || '').trim());
    }
  }

  resolveDbPath(): string {
    if (this.dbPathOverride) {
      return path.resolve(this.dbPathOverride);
    }
    return path.resolve(String(this.store.get('storage.dbPath') || './data/opencode-remote.db'));
  }

  databaseExists(): boolean {
    return fs.existsSync(this.resolveDbPath());
  }

  getDbStats(): Record<string, number> {
    if (!this.databaseExists()) {
      return {
        users: 0,
        runs: 0,
        audit: 0,
        deadLetters: 0,
      };
    }

    const db = new Database(this.resolveDbPath(), { readonly: true });
    try {
      return {
        users: this.count(db, 'users'),
        runs: this.count(db, 'runs'),
        audit: this.count(db, 'audit'),
        deadLetters: this.count(db, 'dead_letters'),
      };
    } finally {
      db.close();
    }
  }

  getRecentAudit(limit = 20): AuditRow[] {
    if (!this.databaseExists()) {
      return [];
    }

    const db = new Database(this.resolveDbPath(), { readonly: true });
    try {
      return db
        .prepare('SELECT id, event_type, payload_json, created_at FROM audit ORDER BY id DESC LIMIT ?')
        .all(limit) as AuditRow[];
    } finally {
      db.close();
    }
  }

  getFlowInsights(limit = 120): FlowInsights {
    const rows = this.getRecentAudit(limit);
    return buildFlowInsights(rows, 18);
  }

  getTaskCatalog(): TaskDefinition[] {
    return [
      {
        id: 'status',
        label: 'System Status',
        description: 'Show runtime configuration and DB counters.',
      },
      {
        id: 'logs',
        label: 'Recent Audit Logs',
        description: 'Show recent audit entries from SQLite.',
        args: ['limit'],
      },
      {
        id: 'flow',
        label: 'Message Flow',
        description: 'Show stage counts and transitions from audit stream.',
        args: ['limit'],
      },
      {
        id: 'deadletters',
        label: 'Dead Letters',
        description: 'Show failed inbound payloads requiring operator review.',
        args: ['limit'],
      },
      {
        id: 'db.info',
        label: 'DB Stats',
        description: 'Show table counts for control-plane data.',
      },
      {
        id: 'db.vacuum',
        label: 'DB Vacuum',
        description: 'Run SQLite VACUUM for maintenance.',
      },
      {
        id: 'db.prune',
        label: 'DB Prune',
        description: 'Delete old rows from selected maintenance table.',
        args: ['table', 'days'],
      },
      {
        id: 'security.rotate-token-check',
        label: 'Security Rotate Check',
        description: 'Check token hygiene and rotation posture.',
      },
    ];
  }

  /** Execute named operational task for CLI/TUI consumers. */
  executeTask(request: TaskRequest): TaskResult {
    const args = request.args || {};

    if (request.id === 'status') {
      const cfg = this.getRuntimeConfig();
      const stats = this.getDbStats();
      return {
        id: request.id,
        title: 'System Status',
        lines: [
          `Owner: ${cfg.ownerNumber || '(not configured)'}`,
          `DB: ${cfg.storageDbPath}`,
          `DB exists: ${this.databaseExists() ? 'yes' : 'no'}`,
          `Telegram: ${cfg.telegramEnabled ? cfg.telegramMode : 'disabled'}`,
          `Telegram polling: ${cfg.telegramPollingState} conflicts=${cfg.telegramPollingConflictCount} retry_in=${Math.max(0, Math.ceil(cfg.telegramPollingRetryInMs / 1000))}s`,
          `Rows: users=${stats.users} runs=${stats.runs} audit=${stats.audit} dead_letters=${stats.deadLetters}`,
        ],
      };
    }

    if (request.id === 'logs') {
      const limit = Number(args.limit || 20);
      const rows = this.getRecentAudit(Number.isFinite(limit) ? limit : 20);
      return {
        id: request.id,
        title: 'Recent Audit Logs',
        lines: rows.length
          ? rows.map(
              (row) => `[${new Date(row.created_at).toISOString()}] ${row.event_type} ${row.payload_json}`,
            )
          : ['No audit rows found.'],
      };
    }

    if (request.id === 'flow') {
      const limit = Number(args.limit || 120);
      const flow = this.getFlowInsights(Number.isFinite(limit) ? limit : 120);
      const stageLines = Object.entries(flow.stageCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([stage, count]) => `stage ${stage}: ${count}`);
      const transitionLines = Object.entries(flow.transitions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([transition, count]) => `transition ${transition}: ${count}`);
      const timeline = flow.latest
        .slice(0, 12)
        .map((item) => `${new Date(item.at).toISOString()} ${item.eventType}${item.summary ? ` | ${item.summary}` : ''}`);
      return {
        id: request.id,
        title: 'Flow Insights',
        lines: [
          ...stageLines,
          '',
          ...transitionLines,
          '',
          ...timeline,
        ].filter(Boolean),
      };
    }

    if (request.id === 'deadletters') {
      const limit = Number(args.limit || 20);
      const rows = this.getDeadLetters(Number.isFinite(limit) ? limit : 20);
      return {
        id: request.id,
        title: 'Dead Letters',
        lines: rows.length
          ? rows.map(
              (row) =>
                `[${new Date(row.created_at).toISOString()}] ${row.channel} sender=${row.sender || '-'} attempts=${row.attempts} error=${row.error}`,
            )
          : ['No dead letters found.'],
      };
    }

    if (request.id === 'db.info') {
      const stats = this.getDbStats();
      return {
        id: request.id,
        title: 'DB Stats',
        lines: [JSON.stringify(stats, null, 2)],
      };
    }

    if (request.id === 'db.vacuum') {
      this.vacuum();
      return {
        id: request.id,
        title: 'DB Vacuum',
        lines: ['VACUUM complete.'],
      };
    }

    if (request.id === 'db.prune') {
      const table = String(args.table || 'audit');
      const days = Number(args.days || 30);
      const allowed = ['audit', 'runs', 'dead_letters', 'messages'];
      if (!allowed.includes(table)) {
        return {
          id: request.id,
          title: 'DB Prune',
          lines: ['Invalid table. Use one of: audit, runs, dead_letters, messages'],
        };
      }
      const deleted = this.prune(table as 'audit' | 'runs' | 'dead_letters' | 'messages', days);
      return {
        id: request.id,
        title: 'DB Prune',
        lines: [`Deleted ${deleted} rows from ${table} older than ${Math.max(1, Math.floor(days))} day(s).`],
      };
    }

    if (request.id === 'security.rotate-token-check') {
      const findings = this.getSecurityRotationCheck();
      return {
        id: request.id,
        title: 'Security Rotate Check',
        lines: findings.length ? findings : ['No immediate token hygiene issues found.'],
      };
    }

    return {
      id: request.id,
      title: 'Unknown Task',
      lines: ['Task not recognized.'],
    };
  }

  getTelegramPollingHealth(): TelegramPollingHealth {
    if (!this.databaseExists()) {
      return { state: 'unknown', conflictCount: 0, retryInMs: 0 };
    }

    const db = new Database(this.resolveDbPath(), { readonly: true });
    try {
      const conflictRow = db
        .prepare(
          'SELECT payload_json, created_at FROM audit WHERE event_type = ? ORDER BY id DESC LIMIT 1',
        )
        .get('telegram.polling_conflict') as { payload_json?: string; created_at?: number } | undefined;

      if (!conflictRow) {
        return { state: 'healthy', conflictCount: 0, retryInMs: 0 };
      }

      const recoveredRow = db
        .prepare(
          'SELECT created_at FROM audit WHERE event_type = ? ORDER BY id DESC LIMIT 1',
        )
        .get('telegram.polling_recovered') as { created_at?: number } | undefined;

      let conflictCount = 1;
      let retryInMs = 0;
      let pausedUntil = 0;
      try {
        const payload = JSON.parse(String(conflictRow.payload_json || '{}')) as {
          conflictCount?: number;
          retryInMs?: number;
          pausedUntil?: number;
        };
        conflictCount = Number(payload.conflictCount || 1);
        retryInMs = Number(payload.retryInMs || 0);
        pausedUntil = Number(payload.pausedUntil || 0);
      } catch {
        // ignore malformed payloads
      }

      const recoveredAt = Number(recoveredRow?.created_at || 0);
      const conflictAt = Number(conflictRow.created_at || 0);
      if (recoveredAt >= conflictAt) {
        return { state: 'healthy', conflictCount: 0, retryInMs: 0 };
      }

      const remaining = Math.max(0, pausedUntil - Date.now());
      return {
        state: 'degraded',
        conflictCount,
        retryInMs: remaining || retryInMs,
      };
    } finally {
      db.close();
    }
  }

  getSecurityRotationCheck(): string[] {
    const findings: string[] = [];
    const telegramEnabled = Boolean(this.store.get('telegram.enabled'));
    const token = String(this.store.get('telegram.botToken') || '').trim();
    const webhookEnabled = Boolean(this.store.get('telegram.webhookEnabled'));
    const webhookSecret = String(this.store.get('telegram.webhookSecret') || '').trim();
    const requireEnvTokens = Boolean(this.store.get('security.requireEnvTokens'));

    if (telegramEnabled && !token) {
      findings.push('FAIL: Telegram is enabled but telegram.botToken is empty.');
    }
    if (token && looksLikePlaceholderToken(token)) {
      findings.push('WARN: telegram.botToken looks like a placeholder value.');
    }
    if (webhookEnabled && !webhookSecret) {
      findings.push('FAIL: Webhook mode enabled without telegram.webhookSecret.');
    }
    if (!requireEnvTokens) {
      findings.push('WARN: security.requireEnvTokens=false. Consider enabling env-only secret mode.');
    }

    findings.push('Action: rotate tokens, set env vars, and remove persisted plaintext secrets.');
    return findings;
  }

  getDeadLetters(limit = 20): DeadLetterRow[] {
    if (!this.databaseExists()) {
      return [];
    }

    const db = new Database(this.resolveDbPath(), { readonly: true });
    try {
      return db
        .prepare(
          'SELECT id, channel, message_id, sender, body, error, attempts, created_at FROM dead_letters ORDER BY id DESC LIMIT ?',
        )
        .all(limit) as DeadLetterRow[];
    } finally {
      db.close();
    }
  }

  getRecentRuns(limit = 20): RunRow[] {
    if (!this.databaseExists()) {
      return [];
    }

    const db = new Database(this.resolveDbPath(), { readonly: true });
    try {
      return db
        .prepare('SELECT run_id, phone, command_type, created_at FROM runs ORDER BY id DESC LIMIT ?')
        .all(limit) as RunRow[];
    } finally {
      db.close();
    }
  }

  vacuum(): void {
    if (!this.databaseExists()) {
      return;
    }

    const db = new Database(this.resolveDbPath());
    try {
      db.prepare('VACUUM').run();
    } finally {
      db.close();
    }
  }

  prune(table: 'audit' | 'runs' | 'dead_letters' | 'messages', olderThanDays: number): number {
    if (!this.databaseExists()) {
      return 0;
    }

    const minDays = Math.max(1, Math.floor(olderThanDays));
    const cutoff = Date.now() - minDays * 24 * 60 * 60 * 1000;

    const db = new Database(this.resolveDbPath());
    try {
      const result = db.prepare(`DELETE FROM ${table} WHERE created_at < ?`).run(cutoff);
      return Number(result.changes || 0);
    } finally {
      db.close();
    }
  }

  private count(db: Database.Database, table: string): number {
    const row = db.prepare(`SELECT COUNT(1) as count FROM ${table}`).get() as { count?: number };
    return Number(row?.count || 0);
  }
}
