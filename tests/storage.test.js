import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { LocalStore } from '../src/storage/sqlite.js';

function withStore() {
  const dbPath = path.join(os.tmpdir(), `opencode-remote-${randomUUID()}.db`);
  const store = new LocalStore(dbPath);
  store.init();
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dbPath, { force: true });
    },
  };
}

test('applies schema migrations and exposes versions', () => {
  const { store, cleanup } = withStore();
  try {
    const migrations = store.getSchemaMigrations();
    assert.ok(migrations.length >= 2);
    assert.equal(migrations[0].version, 1);
  } finally {
    cleanup();
  }
});

test('stores and reads allowlisted users', () => {
  const { store, cleanup } = withStore();
  try {
    store.addOrActivateUser('+15550001111', 'user');
    assert.equal(store.isAllowed('+15550001111'), true);
    assert.equal(store.isOwner('+15550001111'), false);

    store.addOrActivateUser('+15550002222', 'owner');
    assert.equal(store.isOwner('+15550002222'), true);
  } finally {
    cleanup();
  }
});

test('persists and returns runs by phone', () => {
  const { store, cleanup } = withStore();
  try {
    store.saveRun({
      runId: 'RUN12345',
      phone: '+15550001111',
      sessionId: 'sess-1',
      commandType: 'prompt',
      display: 'display text',
      raw: 'raw text',
    });

    const row = store.getRun('RUN12345', '+15550001111');
    assert.equal(row.run_id, 'RUN12345');
    assert.equal(row.command_type, 'prompt');
  } finally {
    cleanup();
  }
});

test('deduplicates message ids', () => {
  const { store, cleanup } = withStore();
  try {
    assert.equal(store.isMessageProcessed('msg-1'), false);
    store.markMessageProcessed('msg-1', '+15550001111');
    assert.equal(store.isMessageProcessed('msg-1'), true);
  } finally {
    cleanup();
  }
});
