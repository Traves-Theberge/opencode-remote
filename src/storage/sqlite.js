import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export class LocalStore {
  constructor(dbPath = './data/opencode-remote.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  init() {
    const absolute = path.resolve(this.dbPath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    this.db = new Database(absolute);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.ensureMigrationTable();
    this.runMigrations();
  }

  ensureMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  }

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
    ];

    const applied = new Set(
      this.db
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all()
        .map((row) => row.version),
    );

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

  ensureOwner(phone) {
    if (!phone) {
      return;
    }
    this.addOrActivateUser(phone, 'owner');
  }

  normalizeRole(role) {
    return role === 'owner' ? 'owner' : 'user';
  }

  addOrActivateUser(phone, role = 'user') {
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

  deactivateUser(phone) {
    const now = Date.now();
    this.db
      .prepare('UPDATE users SET active = 0, updated_at = ? WHERE phone = ?')
      .run(now, phone);
  }

  isAllowed(phone) {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE phone = ? AND active = 1')
      .get(phone);
    return Boolean(row);
  }

  isOwner(phone) {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE phone = ? AND active = 1 AND role = ?')
      .get(phone, 'owner');
    return Boolean(row);
  }

  listAllowedNumbers() {
    return this.db
      .prepare('SELECT phone FROM users WHERE active = 1 ORDER BY role DESC, phone ASC')
      .all()
      .map((row) => row.phone);
  }

  setTelegramIdentity(phone, { userId, username }) {
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

  clearTelegramIdentityByUserId(userId) {
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

  getPhoneByTelegramUserId(userId) {
    const telegramUserId = String(userId || '').trim();
    if (!telegramUserId) {
      return null;
    }

    const row = this.db
      .prepare('SELECT phone FROM users WHERE active = 1 AND telegram_user_id = ? LIMIT 1')
      .get(telegramUserId);

    return row?.phone || null;
  }

  listTelegramBindings() {
    return this.db
      .prepare(
        `
        SELECT phone, telegram_user_id, telegram_username
        FROM users
        WHERE active = 1 AND telegram_user_id IS NOT NULL
        ORDER BY phone ASC
      `,
      )
      .all();
  }

  getBinding(phone) {
    return this.db.prepare('SELECT * FROM bindings WHERE phone = ?').get(phone) || null;
  }

  upsertBinding(phone, patch) {
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

  findBindingBySessionId(sessionId) {
    if (!sessionId) {
      return null;
    }
    return (
      this.db
        .prepare('SELECT * FROM bindings WHERE active_session_id = ? LIMIT 1')
        .get(sessionId) || null
    );
  }

  createConfirmation({ id, phone, action, expiresAt }) {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO confirmations (id, phone, action_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, phone, JSON.stringify(action), expiresAt, now);
  }

  getConfirmation(id) {
    const row = this.db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id);
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

  deleteConfirmation(id) {
    this.db.prepare('DELETE FROM confirmations WHERE id = ?').run(id);
  }

  cleanupConfirmations(now = Date.now()) {
    this.db.prepare('DELETE FROM confirmations WHERE expires_at < ?').run(now);
  }

  saveRun({ runId, phone, sessionId, commandType, display, raw }) {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO runs (run_id, phone, session_id, command_type, display, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(runId, phone, sessionId || null, commandType, display, raw, now);
  }

  getRun(runId, phone) {
    return (
      this.db
        .prepare('SELECT * FROM runs WHERE run_id = ? AND phone = ? LIMIT 1')
        .get(String(runId || '').toUpperCase(), phone) || null
    );
  }

  listRuns(phone, limit = 10) {
    return this.db
      .prepare('SELECT * FROM runs WHERE phone = ? ORDER BY created_at DESC LIMIT ?')
      .all(phone, limit);
  }

  isMessageProcessed(messageId) {
    const row = this.db.prepare('SELECT 1 FROM messages WHERE message_id = ?').get(messageId);
    return Boolean(row);
  }

  markMessageProcessed(messageId, phone) {
    const now = Date.now();
    this.db
      .prepare(
        'INSERT OR IGNORE INTO messages (message_id, phone, created_at) VALUES (?, ?, ?)',
      )
      .run(messageId, phone, now);
    this.db
      .prepare('DELETE FROM messages WHERE created_at < ?')
      .run(now - 5 * 60 * 1000);
  }

  appendAudit(eventType, payload) {
    this.db
      .prepare('INSERT INTO audit (event_type, payload_json, created_at) VALUES (?, ?, ?)')
      .run(eventType, JSON.stringify(payload || {}), Date.now());
  }

  appendDeadLetter({ channel, messageId, sender, body, error, attempts, payload }) {
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
        body || null,
        error,
        attempts,
        JSON.stringify(payload || {}),
        Date.now(),
      );
  }

  getSchemaMigrations() {
    return this.db.prepare('SELECT * FROM schema_migrations ORDER BY version ASC').all();
  }

  getEventOffset(stream) {
    return this.db.prepare('SELECT * FROM event_offsets WHERE stream = ?').get(stream) || null;
  }

  setEventOffset(stream, lastEventId) {
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
