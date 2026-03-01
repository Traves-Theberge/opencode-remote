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
