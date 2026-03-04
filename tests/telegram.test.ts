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

test('prepares polling session before starting polling mode', async () => {
  const restore = withConfig({
    'telegram.enabled': true,
    'telegram.botToken': 'test-token',
    'telegram.webhookEnabled': false,
    'telegram.pollingEnabled': true,
  });
  try {
    const transport = new TelegramTransportStub(async () => null);
    await transport.start();

    assert.equal(transport.startedPolling, true);
    assert.ok(transport.apiCalls.some((call) => call.method === 'deleteWebhook'));
    assert.ok(transport.apiCalls.some((call) => call.method === 'close'));
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

test('renders markdownv2 text while preserving inline code', () => {
  const transport = new TelegramTransportStub(async () => null);
  assert.equal(
    transport.renderMarkdownV2('Run: `ABC123` (done) [ok]'),
    'Run: `ABC123` \\(done\\) \\[ok\\]',
  );
});

test('bolds formatter section lines for styled telegram output', () => {
  const transport = new TelegramTransportStub(async () => null);
  const rendered = transport.renderMarkdownV2(
    '🟢 OpenCode Remote · Status · 10:55\n\nNext\n1) `continue with this task`',
  );

  assert.ok(rendered.includes('*🟢 OpenCode Remote · Status · 10:55*'));
  assert.ok(rendered.includes('*Next*'));
  assert.ok(rendered.includes('1\\)'));
  assert.ok(rendered.includes('`continue with this task`'));
});

test('limits oversized telegram outputs to avoid chat floods', () => {
  const transport = new TelegramTransportStub(async () => null);
  const chunks = Array.from({ length: 20 }, (_v, i) => `chunk-${i + 1}`);
  const limited = transport.limitDeliveryChunks(chunks, 8);

  assert.equal(limited.length, 8);
  assert.equal(limited[0], 'chunk-1');
  assert.equal(limited[5], 'chunk-6');
  assert.ok(String(limited[6]).includes('output truncated in chat'));
  assert.equal(limited[7], 'chunk-20');
});

test('polling loop does not overlap concurrent getUpdates requests', async () => {
  class PollingProbe extends TelegramTransport {
    current = 0;
    maxConcurrent = 0;
    calls = 0;

    constructor() {
      super(async () => null);
    }

    async pollOnce() {
      this.calls += 1;
      this.current += 1;
      this.maxConcurrent = Math.max(this.maxConcurrent, this.current);
      await new Promise((resolve) => setTimeout(resolve, 400));
      this.current -= 1;
    }
  }

  const probe = new PollingProbe();
  probe.running = true;
  probe.startPolling();
  await new Promise((resolve) => setTimeout(resolve, 950));
  await probe.stop();

  assert.ok(probe.calls >= 1);
  assert.equal(probe.maxConcurrent, 1);
});
