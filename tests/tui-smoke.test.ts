import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('opentui dependency resolves under bun runtime', () => {
  const result = spawnSync('bun', ['-e', "import('@opentui/core').then(() => process.exit(0)).catch(() => process.exit(1))"], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
});

test('tui source defines expected interaction keys', () => {
  const source = readFileSync('apps/tui/src/index.ts', 'utf8');
  assert.equal(source.includes("key.name === 'left'"), true);
  assert.equal(source.includes("key.name === 'right'"), true);
  assert.equal(source.includes("key.name === 'o'"), true);
  assert.equal(source.includes("key.name === 'return'"), true);
});
