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
    assert.ok(migrations.length >= 5);
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
    const dedupKey = 'whatsapp:+15550001111:msg-1';
    assert.equal(store.isMessageProcessed(dedupKey), false);
    store.markMessageProcessed({
      dedupKey,
      channel: 'whatsapp',
      sender: '+15550001111',
      transportMessageId: 'msg-1',
    });
    assert.equal(store.isMessageProcessed(dedupKey), true);
  } finally {
    cleanup();
  }
});

test('allows same transport message id across different senders', () => {
  const { store, cleanup } = withStore();
  try {
    store.markMessageProcessed({
      dedupKey: 'telegram:111:42',
      channel: 'telegram',
      sender: '111',
      transportMessageId: '42',
    });

    store.markMessageProcessed({
      dedupKey: 'telegram:222:42',
      channel: 'telegram',
      sender: '222',
      transportMessageId: '42',
    });

    assert.equal(store.isMessageProcessed('telegram:111:42'), true);
    assert.equal(store.isMessageProcessed('telegram:222:42'), true);
  } finally {
    cleanup();
  }
});

test('stores dead-letter events', () => {
  const { store, cleanup } = withStore();
  try {
    store.appendDeadLetter({
      channel: 'whatsapp',
      messageId: 'msg-123',
      sender: '+15550001111',
      body: '@oc /status',
      error: 'simulated failure',
      attempts: 3,
      payload: { timestamp: 12345 },
    });

    const row = store.db
      .prepare('SELECT * FROM dead_letters WHERE message_id = ? LIMIT 1')
      .get('msg-123');

    assert.equal(row.channel, 'whatsapp');
    assert.equal(row.attempts, 3);
    assert.equal(row.sender, '+15550001111');
  } finally {
    cleanup();
  }
});

test('stores and resolves telegram identity mapping', () => {
  const { store, cleanup } = withStore();
  try {
    store.addOrActivateUser('+15550009999', 'user');
    store.setTelegramIdentity('+15550009999', {
      userId: '123456789',
      username: 'alice',
    });

    const phone = store.getPhoneByTelegramUserId('123456789');
    assert.equal(phone, '+15550009999');

    const bindings = store.listTelegramBindings();
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].telegram_username, 'alice');

    store.clearTelegramIdentityByUserId('123456789');
    assert.equal(store.getPhoneByTelegramUserId('123456789'), null);
  } finally {
    cleanup();
  }
});
