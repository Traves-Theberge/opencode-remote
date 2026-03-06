import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { redactString, redactUnknown } from '../security/redaction.js';

/**
 * Input shape for dead-letter persistence.
 */
interface DeadLetterRecord {
  channel: string;
  messageId: string | null;
  sender: string | null;
  body: string | null;
  error: string;
  attempts: number;
  payload: unknown;
}

/**
 * Composite dedupe record stored for inbound idempotency.
 */
interface MessageDedupRecord {
  dedupKey: string;
  channel: string;
  sender: string;
  transportMessageId: string;
}

/**
 * Applied schema migration row.
 */
interface SchemaMigrationRow {
  version: number;
  name: string;
  applied_at: number;
}

/**
 * Session-binding row keyed by phone number.
 */
interface BindingRow {
  phone: string;
  active_session_id: string | null;
  cwd: string | null;
  workspace_root: string | null;
  telegram_chat_id?: string | null;
  updated_at: number;
}

/**
 * Active Telegram identity mapping row.
 */
interface TelegramBindingRow {
  phone: string;
  telegram_user_id: string;
  telegram_username: string | null;
}

/**
 * Persisted command run row.
 */
interface RunRow {
  run_id: string;
  phone: string;
  session_id: string | null;
  command_type: string;
  display: string;
  raw: string;
  created_at: number;
}

/**
 * Distributed transport lease row.
 */
interface TransportLeaseRow {
  name: string;
  owner_id: string;
  expires_at: number;
  updated_at: number;
}

/**
 * SQLite-backed persistence layer for control-plane state.
 */
export class LocalStore {
  dbPath: string;
  db!: Database.Database;

  constructor(dbPath = './data/opencode-remote.db') {
    this.dbPath = dbPath;
  }

  /**
   * Open sqlite database and apply schema migrations.
   */
  init() {
    const absolute = path.resolve(this.dbPath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    this.db = new Database(absolute);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.ensureMigrationTable();
    this.runMigrations();
  }

  /**
   * Ensure migration metadata table exists.
   */
  ensureMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  /**
   * Apply pending schema migrations in version order.
   */
  runMigrations() {
    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            phone TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS bindings (
            phone TEXT PRIMARY KEY,
            active_session_id TEXT,
            cwd TEXT,
            workspace_root TEXT,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS confirmations (
            id TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            action_json TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            session_id TEXT,
            command_type TEXT NOT NULL,
            display TEXT NOT NULL,
            raw TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_runs_phone_created ON runs(phone, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
          CREATE INDEX IF NOT EXISTS idx_confirmations_expires ON confirmations(expires_at);
        `,
      },
      {
        version: 2,
        name: 'event_offsets',
        sql: `
          CREATE TABLE IF NOT EXISTS event_offsets (
            stream TEXT PRIMARY KEY,
            last_event_id TEXT,
            updated_at INTEGER NOT NULL
          );
        `,
      },
      {
        version: 3,
        name: 'dead_letters',
        sql: `
          CREATE TABLE IF NOT EXISTS dead_letters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel TEXT NOT NULL,
            message_id TEXT,
            sender TEXT,
            body TEXT,
            error TEXT NOT NULL,
            attempts INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_dead_letters_created ON dead_letters(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_dead_letters_sender ON dead_letters(sender, created_at DESC);
        `,
      },
      {
        version: 4,
        name: 'telegram_identity_columns',
        sql: `
          ALTER TABLE users ADD COLUMN telegram_user_id TEXT;
          ALTER TABLE users ADD COLUMN telegram_username TEXT;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users(telegram_user_id);

          ALTER TABLE bindings ADD COLUMN telegram_chat_id TEXT;
        `,
      },
      {
        version: 5,
        name: 'message_dedupe_composite_key',
        sql: `
          CREATE TABLE IF NOT EXISTS messages_v2 (
            dedup_key TEXT PRIMARY KEY,
            channel TEXT NOT NULL,
            sender TEXT NOT NULL,
            transport_message_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          INSERT OR IGNORE INTO messages_v2 (dedup_key, channel, sender, transport_message_id, created_at)
          SELECT
            ('legacy:' || COALESCE(phone, 'unknown') || ':' || message_id) AS dedup_key,
            'legacy' AS channel,
            COALESCE(phone, 'unknown') AS sender,
            message_id AS transport_message_id,
            created_at
          FROM messages;

          DROP TABLE messages;
          ALTER TABLE messages_v2 RENAME TO messages;

          CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
          CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages(sender, created_at DESC);
        `,
      },
      {
        version: 6,
        name: 'transport_leases',
        sql: `
          CREATE TABLE IF NOT EXISTS transport_leases (
            name TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_transport_leases_expires ON transport_leases(expires_at);
        `,
      },
    ];

    const appliedRows = this.db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number }>;
    const applied = new Set<number>(appliedRows.map((row) => row.version));

    const insertMigration = this.db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        continue;
      }

      const tx = this.db.transaction(() => {
        this.db.exec(migration.sql);
        insertMigration.run(migration.version, migration.name, Date.now());
      });
      tx();
    }
  }

  /**
   * Ensure owner user exists and is active.
   */
  ensureOwner(phone: string): void {
    if (!phone) {
      return;
    }
    this.addOrActivateUser(phone, 'owner');
  }

  /**
   * Normalize role value to supported enum.
   */
  normalizeRole(role: string): 'owner' | 'user' {
    return role === 'owner' ? 'owner' : 'user';
  }

  /**
   * Upsert active user with requested role.
   */
  addOrActivateUser(phone: string, role = 'user'): void {
    const now = Date.now();
    const safeRole = this.normalizeRole(role);
    const stmt = this.db.prepare(`
      INSERT INTO users (phone, role, active, created_at, updated_at)
      VALUES (@phone, @role, 1, @now, @now)
      ON CONFLICT(phone) DO UPDATE SET
        role = excluded.role,
        active = 1,
        updated_at = excluded.updated_at
    `);
    stmt.run({ phone, role: safeRole, now });
  }

  /**
   * Deactivate user while preserving history.
   */
  deactivateUser(phone: string): void {
    const now = Date.now();
    this.db
      .prepare('UPDATE users SET active = 0, updated_at = ? WHERE phone = ?')
      .run(now, phone);
  }

  /**
   * Check whether user is active in allowlist.
   */
  isAllowed(phone: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE phone = ? AND active = 1')
      .get(phone);
    return Boolean(row);
  }

  /**
   * Check whether user is active owner.
   */
  isOwner(phone: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE phone = ? AND active = 1 AND role = ?')
      .get(phone, 'owner');
    return Boolean(row);
  }

  /**
   * List active users ordered by role then phone.
   */
  listAllowedNumbers(): string[] {
    const rows = this.db
      .prepare('SELECT phone FROM users WHERE active = 1 ORDER BY role DESC, phone ASC')
      .all() as Array<{ phone: string }>;
    return rows.map((row) => row.phone);
  }

  /**
   * Bind Telegram identity metadata to an existing user.
   */
  setTelegramIdentity(phone: string, { userId, username }: { userId: string; username: string | null }): void {
    const telegramUserId = String(userId || '').trim();
    if (!telegramUserId) {
      return;
    }

    this.db
      .prepare(
        `
        UPDATE users
        SET telegram_user_id = ?,
            telegram_username = ?,
            updated_at = ?
        WHERE phone = ?
      `,
      )
      .run(telegramUserId, username || null, Date.now(), phone);
  }

  /**
   * Clear Telegram identity by Telegram user id.
   */
  clearTelegramIdentityByUserId(userId: string): void {
    const telegramUserId = String(userId || '').trim();
    if (!telegramUserId) {
      return;
    }

    this.db
      .prepare(
        `
        UPDATE users
        SET telegram_user_id = NULL,
            telegram_username = NULL,
            updated_at = ?
        WHERE telegram_user_id = ?
      `,
      )
      .run(Date.now(), telegramUserId);
  }

  /**
   * Resolve active phone by bound Telegram user id.
   */
  getPhoneByTelegramUserId(userId: string): string | null {
    const telegramUserId = String(userId || '').trim();
    if (!telegramUserId) {
      return null;
    }

    const row = this.db
      .prepare('SELECT phone FROM users WHERE active = 1 AND telegram_user_id = ? LIMIT 1')
      .get(telegramUserId) as { phone?: string } | undefined;

    return row?.phone || null;
  }

  /**
   * List active Telegram bindings.
   */
  listTelegramBindings(): TelegramBindingRow[] {
    return this.db
      .prepare(
        `
        SELECT phone, telegram_user_id, telegram_username
        FROM users
        WHERE active = 1 AND telegram_user_id IS NOT NULL
        ORDER BY phone ASC
      `,
      )
        .all() as TelegramBindingRow[];
  }

  /**
   * Read binding row for phone.
   */
  getBinding(phone: string): BindingRow | null {
    return (this.db.prepare('SELECT * FROM bindings WHERE phone = ?').get(phone) as BindingRow | undefined) || null;
  }

  /**
   * Upsert per-user binding state.
   */
  upsertBinding(
    phone: string,
    patch: { activeSessionId?: string | null; cwd?: string | null; workspaceRoot?: string | null; telegramChatId?: string | null },
  ): void {
    const current = this.getBinding(phone) || {
      active_session_id: null,
      cwd: null,
      workspace_root: null,
      telegram_chat_id: null,
    };
    const next = {
      active_session_id:
        patch.activeSessionId !== undefined ? patch.activeSessionId : current.active_session_id,
      cwd: patch.cwd !== undefined ? patch.cwd : current.cwd,
      workspace_root:
        patch.workspaceRoot !== undefined ? patch.workspaceRoot : current.workspace_root,
      telegram_chat_id:
        patch.telegramChatId !== undefined ? patch.telegramChatId : current.telegram_chat_id,
    };

    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO bindings (phone, active_session_id, cwd, workspace_root, updated_at)
        VALUES (@phone, @activeSessionId, @cwd, @workspaceRoot, @updatedAt)
        ON CONFLICT(phone) DO UPDATE SET
          active_session_id = excluded.active_session_id,
          cwd = excluded.cwd,
          workspace_root = excluded.workspace_root,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        phone,
        activeSessionId: next.active_session_id,
        cwd: next.cwd,
        workspaceRoot: next.workspace_root,
        updatedAt: now,
      });

    if (next.telegram_chat_id !== undefined) {
      this.db
        .prepare('UPDATE bindings SET telegram_chat_id = ? WHERE phone = ?')
        .run(next.telegram_chat_id, phone);
    }
  }

  /**
   * Lookup binding row by active OpenCode session id.
   */
  findBindingBySessionId(sessionId: string): BindingRow | null {
    if (!sessionId) {
      return null;
    }
    const row = this.db
      .prepare('SELECT * FROM bindings WHERE active_session_id = ? LIMIT 1')
      .get(sessionId) as BindingRow | undefined;
    return row || null;
  }

  /**
   * Store one-time confirmation token.
   */
  createConfirmation({ id, phone, action, expiresAt }: { id: string; phone: string; action: unknown; expiresAt: number }): void {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO confirmations (id, phone, action_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, phone, JSON.stringify(action), expiresAt, now);
  }

  /**
   * Fetch confirmation token with parsed action payload.
   */
  getConfirmation(id: string) {
    const row = this.db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id) as
      | { id: string; phone: string; action_json: string; expires_at: number; created_at: number }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      phone: row.phone,
      action: JSON.parse(row.action_json),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Delete confirmation token.
   */
  deleteConfirmation(id: string): void {
    this.db.prepare('DELETE FROM confirmations WHERE id = ?').run(id);
  }

  /**
   * Delete expired confirmation tokens.
   */
  cleanupConfirmations(now = Date.now()): void {
    this.db.prepare('DELETE FROM confirmations WHERE expires_at < ?').run(now);
  }

  /**
   * Persist command execution output for retrieval.
   */
  saveRun({
    runId,
    phone,
    sessionId,
    commandType,
    display,
    raw,
  }: {
    runId: string;
    phone: string;
    sessionId: string | null;
    commandType: string;
    display: string;
    raw: string;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO runs (run_id, phone, session_id, command_type, display, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(runId, phone, sessionId || null, commandType, display, raw, now);
  }

  /**
   * Fetch stored run by id scoped to user.
   */
  getRun(runId: string, phone: string): RunRow | null {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE run_id = ? AND phone = ? LIMIT 1')
      .get(String(runId || '').toUpperCase(), phone) as RunRow | undefined;
    return row || null;
  }

  /**
   * List most recent stored runs for user.
   */
  listRuns(phone: string, limit = 10): RunRow[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE phone = ? ORDER BY created_at DESC LIMIT ?')
      .all(phone, limit) as RunRow[];
  }

  /**
   * Check whether inbound dedupe key already exists.
   */
  isMessageProcessed(dedupKey: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM messages WHERE dedup_key = ?').get(dedupKey);
    return Boolean(row);
  }

  /**
   * Insert inbound dedupe key and prune old dedupe rows.
   */
  markMessageProcessed({ dedupKey, channel, sender, transportMessageId }: MessageDedupRecord): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO messages (
          dedup_key,
          channel,
          sender,
          transport_message_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(dedupKey, channel, sender, transportMessageId, now);
    this.db
      .prepare('DELETE FROM messages WHERE created_at < ?')
      // Keep dedup memory bounded while preserving enough window to catch
      // Telegram/transport retries and duplicate update delivery.
      .run(now - 5 * 60 * 1000);
  }

  /**
   * Append redacted audit event.
   */
  appendAudit(eventType: string, payload: unknown): void {
    const redactedPayload = redactUnknown(payload);
    this.db
      .prepare('INSERT INTO audit (event_type, payload_json, created_at) VALUES (?, ?, ?)')
      .run(eventType, JSON.stringify(redactedPayload || {}), Date.now());
  }

  /**
   * Append redacted dead-letter transport record.
   */
  appendDeadLetter({ channel, messageId, sender, body, error, attempts, payload }: DeadLetterRecord): void {
    const redactedBody = body ? redactString(body) : null;
    const redactedError = redactString(error);
    const redactedPayload = redactUnknown(payload);
    this.db
      .prepare(
        `
        INSERT INTO dead_letters (
          channel,
          message_id,
          sender,
          body,
          error,
          attempts,
          payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        channel,
        messageId || null,
        sender || null,
        redactedBody,
        redactedError,
        attempts,
        JSON.stringify(redactedPayload || {}),
        Date.now(),
      );
  }

  /**
   * Return applied schema migration history.
   */
  getSchemaMigrations(): SchemaMigrationRow[] {
    return this.db.prepare('SELECT * FROM schema_migrations ORDER BY version ASC').all() as SchemaMigrationRow[];
  }

  /**
   * Read last processed event offset for stream.
   */
  getEventOffset(stream: string): { stream: string; last_event_id: string | null; updated_at: number } | null {
    return (
      this.db.prepare('SELECT * FROM event_offsets WHERE stream = ?').get(stream) as
        | { stream: string; last_event_id: string | null; updated_at: number }
        | undefined
    ) || null;
  }

  /**
   * Upsert last processed event offset for stream.
   */
  setEventOffset(stream: string, lastEventId: string | null): void {
    this.db
      .prepare(
        `
        INSERT INTO event_offsets (stream, last_event_id, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(stream) DO UPDATE SET
          last_event_id = excluded.last_event_id,
          updated_at = excluded.updated_at
      `,
      )
      .run(stream, lastEventId || null, Date.now());
  }

  /**
   * Acquire or renew a named transport lease.
   *
   * Lease can be renewed by same owner or stolen after expiry.
   */
  acquireTransportLease(name: string, ownerId: string, ttlMs = 60_000): boolean {
    const now = Date.now();
    const expiresAt = now + Math.max(1_000, ttlMs);
    const result = this.db
      .prepare(
        `
        INSERT INTO transport_leases (name, owner_id, expires_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          owner_id = excluded.owner_id,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
        WHERE transport_leases.owner_id = excluded.owner_id
           OR transport_leases.expires_at < ?
      `,
      )
      .run(name, ownerId, expiresAt, now, now);

    return result.changes > 0;
  }

  /**
   * Renew transport lease for the same owner.
   */
  renewTransportLease(name: string, ownerId: string, ttlMs = 60_000): boolean {
    return this.acquireTransportLease(name, ownerId, ttlMs);
  }

  /**
   * Release transport lease if owned by owner id.
   */
  releaseTransportLease(name: string, ownerId: string): void {
    this.db
      .prepare('DELETE FROM transport_leases WHERE name = ? AND owner_id = ?')
      .run(name, ownerId);
  }

  /**
   * Read active transport lease by name.
   */
  getTransportLease(name: string): TransportLeaseRow | null {
    return (
      this.db.prepare('SELECT * FROM transport_leases WHERE name = ?').get(name) as
        | TransportLeaseRow
        | undefined
    ) || null;
  }

  /**
   * Close underlying SQLite connection.
   */
  close(): void {
    this.db.close();
  }
}
