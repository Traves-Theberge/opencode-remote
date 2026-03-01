import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { LocalStore } from '../src/storage/sqlite.js';
import { config } from '../src/core/config.js';
import { OpsBridge, buildFlowInsights } from '../packages/bridge/src/index.js';

function withTempDb() {
  const dbPath = path.join(os.tmpdir(), `opencode-remote-bridge-${randomUUID()}.db`);
  const priorDbPath = config.get('storage.dbPath');

  config.set('storage.dbPath', dbPath);
  const store = new LocalStore(dbPath);
  store.init();

  return {
    dbPath,
    store,
    cleanup: () => {
      store.close();
      if (priorDbPath === undefined) {
        config.delete('storage.dbPath');
      } else {
        config.set('storage.dbPath', priorDbPath);
      }
      rmSync(dbPath, { force: true });
    },
  };
}

test('builds flow insights from audit rows', () => {
  const insights = buildFlowInsights([
    {
      id: 1,
      event_type: 'message.incoming',
      payload_json: '{}',
      created_at: 100,
    },
    {
      id: 2,
      event_type: 'command.executed',
      payload_json: '{"command":"status"}',
      created_at: 110,
    },
    {
      id: 3,
      event_type: 'transport.dead_letter',
      payload_json: '{"reason":"timeout"}',
      created_at: 120,
    },
  ]);

  assert.equal(insights.stageCounts.incoming, 1);
  assert.equal(insights.stageCounts.executed, 1);
  assert.equal(insights.stageCounts.dead_letter, 1);
  assert.equal(insights.transitions['incoming->executed'], 1);
  assert.equal(insights.transitions['executed->dead_letter'], 1);
});

test('executes shared flow task from bridge', () => {
  const { store, cleanup } = withTempDb();
  try {
    store.appendAudit('message.incoming', { sender: '+15550001111' });
    store.appendAudit('command.executed', { command: 'status' });
    store.appendAudit('command.blocked', { reason: 'policy' });

    const bridge = new OpsBridge();
    const result = bridge.executeTask({ id: 'flow', args: { limit: 50 } });

    assert.equal(result.id, 'flow');
    assert.ok(result.lines.some((line) => line.includes('stage incoming')));
    assert.ok(result.lines.some((line) => line.includes('transition incoming->executed')));
  } finally {
    cleanup();
  }
});

test('exposes task catalog and status task output', () => {
  const bridge = new OpsBridge();
  const catalog = bridge.getTaskCatalog();
  assert.ok(catalog.some((task) => task.id === 'status'));
  assert.ok(catalog.some((task) => task.id === 'flow'));
  assert.ok(catalog.some((task) => task.id === 'db.vacuum'));

  const status = bridge.executeTask({ id: 'status' });
  assert.equal(status.id, 'status');
  assert.ok(status.lines.some((line) => line.startsWith('DB:')));
});
