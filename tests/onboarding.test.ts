import test from 'node:test';
import assert from 'node:assert/strict';
import { OpsBridge } from '../packages/bridge/src/index.js';

test('rejects invalid owner number during setup', () => {
  const bridge = new OpsBridge();
  assert.throws(() => {
    bridge.applySetup({
      ownerNumber: '5551234567',
      telegramEnabled: false,
      telegramBotToken: '',
      telegramMode: 'polling',
    }, { dryRun: true });
  }, /E\.164/);
});

test('rejects webhook setup without valid https url', () => {
  const bridge = new OpsBridge();
  assert.throws(() => {
    bridge.applySetup({
      ownerNumber: '+15551234567',
      telegramEnabled: true,
      telegramBotToken: 'token',
      telegramMode: 'webhook',
      telegramWebhookUrl: 'http://localhost:9999/webhook',
      telegramWebhookSecret: 'secret',
    }, { dryRun: true });
  }, /HTTPS webhook URL/);
});
