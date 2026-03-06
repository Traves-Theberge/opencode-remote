import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeAdapter } from '../src/adapter/opencode.js';

test('adapter listTools forwards provider/model query', async () => {
  const adapter = new OpenCodeAdapter();
  const calls: Array<{ method: string; payload: unknown }> = [];

  (adapter as unknown as { client: unknown }).client = {
    tool: {
      list: async (payload: unknown) => {
        calls.push({ method: 'tool.list', payload });
        return { data: [{ id: 'bash' }] };
      },
    },
    config: {
      get: async () => ({ data: {} }),
      providers: async () => ({ data: [] }),
    },
  };

  const result = await adapter.listTools('anthropic', 'claude');
  assert.equal(Array.isArray(result), true);
  assert.equal(calls.length, 1);

  const payload = calls[0].payload as { query?: { providerID?: string; modelID?: string } };
  assert.equal(payload.query?.providerID, 'anthropic');
  assert.equal(payload.query?.modelID, 'claude');
});

test('adapter mcp connect/disconnect use path id shape', async () => {
  const adapter = new OpenCodeAdapter();
  const calls: Array<{ method: string; payload: unknown }> = [];

  (adapter as unknown as { client: unknown }).client = {
    mcp: {
      connect: async (payload: unknown) => {
        calls.push({ method: 'mcp.connect', payload });
        return { data: { ok: true } };
      },
      disconnect: async (payload: unknown) => {
        calls.push({ method: 'mcp.disconnect', payload });
        return { data: { ok: true } };
      },
    },
  };

  await adapter.connectMcp('docs');
  await adapter.disconnectMcp('docs');

  const connectPayload = calls.find((entry) => entry.method === 'mcp.connect')?.payload as { path?: { id?: string } };
  const disconnectPayload = calls.find((entry) => entry.method === 'mcp.disconnect')?.payload as { path?: { id?: string } };

  assert.equal(connectPayload.path?.id, 'docs');
  assert.equal(disconnectPayload.path?.id, 'docs');
});

test('adapter retries unsupported Codex account failures with request-local big-pickle override', async () => {
  const adapter = new OpenCodeAdapter();
  const promptCalls: Array<unknown> = [];

  (adapter as unknown as { client: unknown }).client = {
    session: {
      create: async () => ({ data: { id: 'fresh-session' } }),
      prompt: async (payload: unknown) => {
        promptCalls.push(payload);
        if (promptCalls.length === 1) {
          return {
            data: {
              parts: [],
              info: {
                summary: { id: 'sum-1' },
                error: {
                  message:
                    "The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.",
                },
              },
            },
          };
        }

        return {
          data: {
            parts: [{ type: 'text', text: 'fallback ok' }],
            info: { id: 'msg-2' },
          },
        };
      },
      message: async () => ({ data: { parts: [] } }),
    },
    config: {
      get: async () => ({ data: {} }),
      providers: async () => ({ data: {} }),
    },
  };

  const result = await adapter.sendPrompt('hello', { sessionId: 'orig-session' });
  assert.equal(result.response, 'fallback ok');
  assert.equal(promptCalls.length, 2);

  const second = promptCalls[1] as {
    body?: { model?: { providerID?: string; modelID?: string } };
    path?: { id?: string };
  };
  assert.equal(second.path?.id, 'fresh-session');
  assert.equal(second.body?.model?.providerID, 'opencode');
  assert.equal(second.body?.model?.modelID, 'big-pickle');
});
