import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';

export class AccessController {
  constructor(store) {
    this.store = store;
    this.sessions = new Map();
  }

  checkAccess(phoneNumber) {
    const normalized = config.normalizePhone(phoneNumber);
    const isAllowed = this.store.isAllowed(normalized);
    const isOwner = this.store.isOwner(normalized);

    logger.debug({ phoneNumber: normalized, isAllowed, isOwner }, 'Access check');

    return {
      allowed: isAllowed,
      role: isOwner ? 'owner' : isAllowed ? 'user' : 'denied',
    };
  }

  isOwner(phoneNumber) {
    return this.store.isOwner(config.normalizePhone(phoneNumber));
  }

  getOrCreateSession(phoneNumber) {
    const normalized = config.normalizePhone(phoneNumber);
    const role = this.checkAccess(normalized).role;
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

  setBusy(session, busy) {
    session.busy = Boolean(busy);
  }

  isBusy(session) {
    return Boolean(session.busy);
  }

  setWorkspaceRoot(session, workspaceRoot) {
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

  getWorkspaceRoot(session) {
    return session.workspaceRoot;
  }

  getCwd(session) {
    return session.cwd || session.workspaceRoot;
  }

  setCwd(session, targetPath) {
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

  setActiveSessionId(session, sessionId) {
    session.activeSessionId = sessionId || null;
    this.persistBinding(session);
  }

  getActiveSessionId(session) {
    return session.activeSessionId || null;
  }

  findSessionByActiveSessionId(sessionId) {
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

  checkInactivity(session) {
    const timeout = config.get('security.inactivityTimeout');
    const inactive = Date.now() - session.lastActivity > timeout;
    if (inactive) {
      session.locked = true;
      logger.info({ phoneNumber: session.phoneNumber }, 'Session locked due to inactivity');
    }

    return session.locked;
  }

  addAllowedNumber(number, addedBy) {
    const normalized = config.normalizePhone(number);
    this.store.addOrActivateUser(normalized, 'user');
    logger.info({ addedBy, number: normalized }, 'Number added to allowlist');
  }

  removeAllowedNumber(number, removedBy) {
    const normalized = config.normalizePhone(number);
    this.store.deactivateUser(normalized);
    this.sessions.delete(normalized);
    logger.info({ removedBy, number: normalized }, 'Number removed from allowlist');
  }

  listAllowedNumbers() {
    return this.store.listAllowedNumbers();
  }

  createConfirm(action, session) {
    const confirmId = uuidv4().slice(0, 8).toUpperCase();
    const maxAge = config.get('security.maxConfirmAge');
    this.store.createConfirmation({
      id: confirmId,
      phone: session.phoneNumber,
      action,
      expiresAt: Date.now() + maxAge,
    });

    logger.info({ confirmId, action: action.type }, 'Confirmation created');
    return confirmId;
  }

  verifyConfirm(confirmId, session) {
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

  cleanupExpiredConfirms() {
    this.store.cleanupConfirmations();
  }

  persistBinding(session) {
    this.store.upsertBinding(session.phoneNumber, {
      activeSessionId: session.activeSessionId,
      cwd: session.cwd,
      workspaceRoot: session.workspaceRoot,
    });
  }
}
