import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandExecutor } from '../src/commands/executor.js';

class AdapterStub {
  called: Array<{ method: string; args: unknown[] }> = [];

  async getModelStatus() {
    this.called.push({ method: 'getModelStatus', args: [] });
    return { model: 'x' };
  }

  async listProviders() {
    this.called.push({ method: 'listProviders', args: [] });
    return {
      all: [
        {
          id: 'anthropic',
          models: {
            'claude-3-5-sonnet': { status: 'active' },
            'claude-3-5-haiku': { status: 'active' },
          },
        },
      ],
    };
  }

  async setModel(providerId: string, modelId: string) {
    this.called.push({ method: 'setModel', args: [providerId, modelId] });
    return { ok: true };
  }

  async listToolIds() {
    this.called.push({ method: 'listToolIds', args: [] });
    return ['bash'];
  }

  async listTools(providerId: string, modelId: string) {
    this.called.push({ method: 'listTools', args: [providerId, modelId] });
    return [{ id: 'bash' }];
  }

  async getMcpStatus() {
    this.called.push({ method: 'getMcpStatus', args: [] });
    return [{ id: 'docs', connected: true }];
  }

  async addMcpServer(name: string, command: string) {
    this.called.push({ method: 'addMcpServer', args: [name, command] });
    return { ok: true };
  }

  async connectMcp(server: string) {
    this.called.push({ method: 'connectMcp', args: [server] });
    return { ok: true };
  }

  async disconnectMcp(server: string) {
    this.called.push({ method: 'disconnectMcp', args: [server] });
    return { ok: true };
  }

  async listSkills() {
    this.called.push({ method: 'listSkills', args: [] });
    return [{ name: 'brainstorming' }];
  }

  async listCommands() {
    this.called.push({ method: 'listCommands', args: [] });
    return [{ id: 'status' }];
  }

  async getDiagnostics() {
    this.called.push({ method: 'getDiagnostics', args: [] });
    return { lsp: true };
  }
}

class AccessStub {
  getActiveSessionId() {
    return 'sess-1';
  }
  getCwd() {
    return '/tmp';
  }
  setActiveSessionId() {}
  setWorkspaceRoot() {}
  setCwd() {
    return { ok: true, cwd: '/tmp' };
  }
}

class StoreStub {
  getRun() {
    return null;
  }
  listRuns() {
    return [];
  }
}

const session = {
  id: 's',
  phoneNumber: '+15550001111',
  role: 'owner' as const,
  createdAt: Date.now(),
  lastActivity: Date.now(),
  locked: false,
  activeSessionId: 'sess-1',
  cwd: '/tmp',
  workspaceRoot: '/tmp',
  busy: false,
};

test('executes advanced namespace intents through adapter', async () => {
  const adapter = new AdapterStub();
  const executor = new CommandExecutor(adapter as never, new AccessStub() as never, new StoreStub() as never);

  await executor.execute({ type: 'model.status' }, session);
  const modelSummary = await executor.execute({ type: 'model.list' }, session);
  const modelFull = await executor.execute({ type: 'model.list', verbose: true }, session);
  await executor.execute({ type: 'model.set', providerId: 'anthropic', modelId: 'claude' }, session);
  await executor.execute({ type: 'tools.ids' }, session);
  await executor.execute({ type: 'tools.list', providerId: 'anthropic', modelId: 'claude' }, session);
  await executor.execute({ type: 'mcp.status' }, session);
  await executor.execute({ type: 'mcp.add', name: 'docs', command: 'npx server' }, session);
  await executor.execute({ type: 'mcp.connect', server: 'docs' }, session);
  await executor.execute({ type: 'mcp.disconnect', server: 'docs' }, session);
  await executor.execute({ type: 'skills.list' }, session);
  await executor.execute({ type: 'opencode.commands' }, session);
  await executor.execute({ type: 'opencode.diagnostics' }, session);

  const methods = adapter.called.map((entry) => entry.method);
  assert.ok(String(modelSummary).includes('Tip: `/model list full`'));
  assert.ok(!String(modelSummary).includes('```json'));
  assert.ok(!String(modelFull).includes('```json'));
  assert.equal(methods.includes('getModelStatus'), true);
  assert.equal(methods.includes('setModel'), true);
  assert.equal(methods.includes('listTools'), true);
  assert.equal(methods.includes('addMcpServer'), true);
  assert.equal(methods.includes('listSkills'), true);
  assert.equal(methods.includes('getDiagnostics'), true);
});
