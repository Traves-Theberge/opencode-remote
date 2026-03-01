import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { LocalStore } from '../src/storage/sqlite.js';
import { AccessController } from '../src/access/controller.js';

function withAccess() {
  const dbPath = path.join(os.tmpdir(), `opencode-remote-access-${randomUUID()}.db`);
  const store = new LocalStore(dbPath);
  store.init();
  store.addOrActivateUser('+15550001111', 'owner');
  const access = new AccessController(store);

  return {
    access,
    store,
    cleanup: () => {
      store.close();
      rmSync(dbPath, { force: true });
    },
  };
}

test('persists session binding updates to sqlite', () => {
  const { access, store, cleanup } = withAccess();
  try {
    const session = access.getOrCreateSession('+15550001111');
    access.setWorkspaceRoot(session, '/tmp/workspace');
    access.setCwd(session, '.');
    access.setActiveSessionId(session, 'sess-abc');

    const binding = store.getBinding('+15550001111');
    assert.equal(binding.active_session_id, 'sess-abc');
    assert.ok(binding.workspace_root.includes('/tmp/workspace'));
    assert.ok(binding.cwd.includes('/tmp/workspace'));
  } finally {
    cleanup();
  }
});

test('blocks path escape outside workspace root', () => {
  const { access, cleanup } = withAccess();
  try {
    const session = access.getOrCreateSession('+15550001111');
    access.setWorkspaceRoot(session, '/tmp/workspace');
    const result = access.setCwd(session, '../etc');
    assert.equal(result.ok, false);
  } finally {
    cleanup();
  }
});
