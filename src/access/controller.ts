import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import type { LocalStore } from '../storage/sqlite.js';

/**
 * In-memory session state tracked per normalized sender identity.
 */
export interface SessionState {
  id: string;
  phoneNumber: string;
  role: 'owner' | 'user';
  createdAt: number;
  lastActivity: number;
  locked: boolean;
  activeSessionId: string | null;
  cwd: string | null;
  workspaceRoot: string | null;
  busy: boolean;
  confirmed?: boolean;
}

/**
 * Persisted confirmation payload for dangerous command replay.
 */
interface ConfirmAction {
  type: string;
  args: string[];
  context: { sender?: string; role?: string };
}

/**
 * Access decision with resolved caller role.
 */
interface AccessCheckResult {
  allowed: boolean;
  role: 'owner' | 'user' | 'denied';
}

/**
 * Access/session state coordinator.
 *
 * Enforces allowlist and role checks, manages in-memory session state, and
 * persists session binding metadata into LocalStore.
 */
export class AccessController {
  store: LocalStore;
  sessions: Map<string, SessionState>;

  constructor(store: LocalStore) {
    this.store = store;
    this.sessions = new Map();
  }

  /** Validate sender identity against allowlist + owner role. */
  checkAccess(phoneNumber: string): AccessCheckResult {
    const normalized = config.normalizePhone(phoneNumber);
    const isAllowed = this.store.isAllowed(normalized);
    const isOwner = this.store.isOwner(normalized);

    logger.debug({ phoneNumber: normalized, isAllowed, isOwner }, 'Access check');

    return {
      allowed: isAllowed,
      role: isOwner ? 'owner' : isAllowed ? 'user' : 'denied',
    };
  }

  /**
   * Check whether a number is the configured owner.
   */
  isOwner(phoneNumber: string): boolean {
    return this.store.isOwner(config.normalizePhone(phoneNumber));
  }

  /** Resolve or create in-memory session for sender phone. */
  getOrCreateSession(phoneNumber: string): SessionState {
    const normalized = config.normalizePhone(phoneNumber);
    const access = this.checkAccess(normalized);
    const role = access.role;
    if (role === 'denied') {
      throw new Error('Access denied');
    }

    let session = this.sessions.get(normalized);
    if (!session) {
      const binding = this.store.getBinding(normalized);
      session = {
        id: uuidv4(),
        phoneNumber: normalized,
        role,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        locked: false,
        activeSessionId: binding?.active_session_id || null,
        cwd: binding?.cwd || null,
        workspaceRoot: binding?.workspace_root || null,
        busy: false,
      };
      this.sessions.set(normalized, session);
      logger.info({ phoneNumber: normalized, role }, 'Session created');
    }

    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Mark session execution state to prevent overlapping work.
   */
  setBusy(session: SessionState, busy: boolean): void {
    session.busy = Boolean(busy);
  }

  /**
   * Read current busy flag for the session.
   */
  isBusy(session: SessionState): boolean {
    return Boolean(session.busy);
  }

  /**
   * Set workspace root and persist binding metadata.
   */
  setWorkspaceRoot(session: SessionState, workspaceRoot: string): void {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
      return;
    }

    const normalizedRoot = path.resolve(workspaceRoot);
    session.workspaceRoot = normalizedRoot;
    if (!session.cwd) {
      session.cwd = normalizedRoot;
    }

    this.persistBinding(session);
  }

  /**
   * Get configured workspace root for the session.
   */
  getWorkspaceRoot(session: SessionState): string | null {
    return session.workspaceRoot;
  }

  /**
   * Resolve effective working directory for command execution.
   */
  getCwd(session: SessionState): string | null {
    return session.cwd || session.workspaceRoot;
  }

  /** Set working directory within workspace boundary. */
  setCwd(session: SessionState, targetPath: string) {
    if (!targetPath || typeof targetPath !== 'string') {
      return { ok: false, error: 'Missing path' };
    }

    if (!session.workspaceRoot) {
      return { ok: false, error: 'Workspace root is not initialized yet' };
    }

    const root = session.workspaceRoot;
    const candidate = targetPath.startsWith('/')
      ? path.resolve(targetPath)
      : path.resolve(root, targetPath);

    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      return { ok: false, error: 'Path escapes workspace root' };
    }

    session.cwd = candidate;
    session.lastActivity = Date.now();
    this.persistBinding(session);
    return { ok: true, cwd: candidate };
  }

  /**
   * Persist currently selected OpenCode session id for caller.
   */
  setActiveSessionId(session: SessionState, sessionId: string | null): void {
    session.activeSessionId = sessionId || null;
    this.persistBinding(session);
  }

  /**
   * Read currently selected OpenCode session id.
   */
  getActiveSessionId(session: SessionState): string | null {
    return session.activeSessionId || null;
  }

  /**
   * Resolve in-memory session by active OpenCode session id.
   */
  findSessionByActiveSessionId(sessionId: string): SessionState | null {
    if (!sessionId) {
      return null;
    }

    for (const session of this.sessions.values()) {
      if (session.activeSessionId === sessionId) {
        return session;
      }
    }

    const binding = this.store.findBindingBySessionId(sessionId);
    if (!binding?.phone) {
      return null;
    }

    return this.sessions.get(binding.phone) || null;
  }

  /**
   * Lock session when inactivity timeout is exceeded.
   */
  checkInactivity(session: SessionState): boolean {
    const timeout = Number(config.get('security.inactivityTimeout')) || 15 * 60 * 1000;
    const inactive = Date.now() - session.lastActivity > timeout;
    if (inactive) {
      session.locked = true;
      logger.info({ phoneNumber: session.phoneNumber }, 'Session locked due to inactivity');
    }

    return session.locked;
  }

  /**
   * Add allowlisted phone number.
   */
  addAllowedNumber(number: string, addedBy: string): void {
    const normalized = config.normalizePhone(number);
    this.store.addOrActivateUser(normalized, 'user');
    logger.info({ addedBy, number: normalized }, 'Number added to allowlist');
  }

  /**
   * Remove allowlisted phone number and evict cached session.
   */
  removeAllowedNumber(number: string, removedBy: string): void {
    const normalized = config.normalizePhone(number);
    this.store.deactivateUser(normalized);
    this.sessions.delete(normalized);
    logger.info({ removedBy, number: normalized }, 'Number removed from allowlist');
  }

  /**
   * Bind Telegram identity to an allowlisted phone number.
   */
  bindTelegramUser(
    phone: string,
    telegramUserId: string,
    telegramUsername: string | null,
    actor: string,
  ): void {
    const normalized = config.normalizePhone(phone);
    if (!normalized || !this.store.isAllowed(normalized)) {
      throw new Error('Target phone must exist in allowlist before binding Telegram user');
    }

    this.store.setTelegramIdentity(normalized, {
      userId: telegramUserId,
      username: telegramUsername,
    });
    logger.info(
      { actor, phone: normalized, telegramUserId, telegramUsername },
      'Telegram identity bound to user',
    );
  }

  /**
   * Remove Telegram identity binding by Telegram user id.
   */
  unbindTelegramUser(telegramUserId: string, actor: string): void {
    this.store.clearTelegramIdentityByUserId(telegramUserId);
    logger.info({ actor, telegramUserId }, 'Telegram identity unbound from user');
  }

  /**
   * List active phone-to-Telegram identity bindings.
   */
  listTelegramBindings() {
    return this.store.listTelegramBindings();
  }

  /**
   * List active allowlisted phone numbers.
   */
  listAllowedNumbers(): string[] {
    return this.store.listAllowedNumbers();
  }

  /** Create single-use confirmation id for dangerous actions. */
  createConfirm(action: ConfirmAction, session: SessionState): string {
    const confirmId = uuidv4().slice(0, 8).toUpperCase();
    const maxAge = Number(config.get('security.maxConfirmAge')) || 5 * 60 * 1000;
    this.store.createConfirmation({
      id: confirmId,
      phone: session.phoneNumber,
      action,
      expiresAt: Date.now() + maxAge,
    });

    logger.info({ confirmId, action: action.type }, 'Confirmation created');
    return confirmId;
  }

  /** Verify and consume confirmation token for current session. */
  verifyConfirm(confirmId: string, session: SessionState) {
    const pending = this.store.getConfirmation(confirmId);
    if (!pending) {
      return { valid: false, error: 'Confirmation not found' };
    }

    if (Date.now() > pending.expiresAt) {
      this.store.deleteConfirmation(confirmId);
      return { valid: false, error: 'Confirmation expired' };
    }

    if (pending.phone !== session.phoneNumber) {
      return { valid: false, error: 'Confirmation for different session' };
    }

    this.store.deleteConfirmation(confirmId);
    logger.info({ confirmId }, 'Confirmation verified');
    return { valid: true, action: pending.action };
  }

  /**
   * Delete expired confirmation rows from storage.
   */
  cleanupExpiredConfirms(): void {
    this.store.cleanupConfirmations();
  }

  /**
   * Evict stale in-memory sessions while preserving busy sessions.
   */
  cleanupStaleSessions(): void {
    const now = Date.now();
    const maxAgeMs = Number(config.get('security.sessionMaxAge')) || 24 * 60 * 60 * 1000;
    const staleTimeoutMs =
      Number(config.get('security.sessionStaleTimeout')) || 2 * 60 * 60 * 1000;

    for (const [phone, session] of this.sessions.entries()) {
      if (session.busy) {
        continue;
      }

      const tooOld = now - session.createdAt > maxAgeMs;
      const tooIdle = now - session.lastActivity > staleTimeoutMs;
      if (!tooOld && !tooIdle) {
        continue;
      }

      this.sessions.delete(phone);
      logger.info(
        {
          phoneNumber: phone,
          reason: tooOld ? 'max-age' : 'stale-timeout',
        },
        'Session evicted from in-memory cache',
      );
    }
  }

  /**
   * Persist mutable session binding state in SQLite.
   */
  persistBinding(session: SessionState): void {
    this.store.upsertBinding(session.phoneNumber, {
      activeSessionId: session.activeSessionId,
      cwd: session.cwd,
      workspaceRoot: session.workspaceRoot,
    });
  }
}
