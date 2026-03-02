import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramTransport } from '../src/transport/telegram.js';
import { config } from '../src/core/config.js';

class TelegramTransportStub extends TelegramTransport {
  apiCalls: Array<{ method: string; body: Record<string, unknown> }>;
  sent: Array<{ to: string; text: string }>;
  startedWebhook: boolean;
  startedPolling: boolean;

  constructor(onMessage: (event: unknown) => Promise<string | null>) {
    super(onMessage);
    this.apiCalls = [];
    this.sent = [];
    this.startedWebhook = false;
    this.startedPolling = false;
  }

  async api(method, body) {
    this.apiCalls.push({ method, body });
    return { ok: true, result: [] };
  }

  async send(to, text) {
    this.sent.push({ to, text });
  }

  async startWebhook() {
    this.startedWebhook = true;
  }

  startPolling() {
    this.startedPolling = true;
  }
}

function withConfig(overrides) {
  const snapshot = {};
  for (const [key, value] of Object.entries(overrides)) {
    snapshot[key] = config.get(key);
    config.set(key, value);
  }

  return () => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        config.delete(key);
      } else {
        config.set(key, value);
      }
    }
  };
}

test('uses update_id for telegram callback message identity', async () => {
  const restore = withConfig({ 'telegram.allowGroupChats': true });
  try {
    const events: Array<{ messageId?: string }> = [];
    const transport = new TelegramTransportStub(async (event) => {
      events.push(event as { messageId?: string });
      return 'ok';
    });

    await transport.processUpdate({
      update_id: 9001,
      callback_query: {
        id: 'cbq-1',
        data: 'oc:status',
        from: { id: 123, username: 'alice' },
        message: {
          message_id: 77,
          date: 1,
          chat: { id: 456, type: 'private' },
        },
      },
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].messageId, '9001');
  } finally {
    restore();
  }
});

test('blocks non-private chats by default', () => {
  const restore = withConfig({ 'telegram.allowGroupChats': false });
  try {
    const transport = new TelegramTransportStub(async () => null);
    assert.equal(transport.isAllowedChatType('private'), true);
    assert.equal(transport.isAllowedChatType('group'), false);
    assert.equal(transport.isAllowedChatType('supergroup'), false);
  } finally {
    restore();
  }
});

test('uses webhook mode when both telegram delivery modes are enabled', async () => {
  const restore = withConfig({
    'telegram.enabled': true,
    'telegram.botToken': 'test-token',
    'telegram.webhookEnabled': true,
    'telegram.pollingEnabled': true,
  });
  try {
    const transport = new TelegramTransportStub(async () => null);
    await transport.start();

    assert.equal(transport.startedWebhook, true);
    assert.equal(transport.startedPolling, false);
  } finally {
    restore();
  }
});

test('normalizes plain telegram shorthand to slash commands', () => {
  const transport = new TelegramTransportStub(async () => null);
  assert.equal(transport.normalizeBody('status'), '/status');
  assert.equal(transport.normalizeBody('sessions'), '/session list');
  assert.equal(transport.normalizeBody('help'), '/help');
});
