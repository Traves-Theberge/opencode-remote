import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRouter } from '../src/router/index.js';

class AccessControllerStub {
  sessions = new Map();
  owner = true;

  createConfirm() {
    return 'CONFIRM01';
  }

  verifyConfirm() {
    return { valid: false, error: 'not implemented in stub' };
  }

  listAllowedNumbers() {
    return [];
  }

  isOwner() {
    return this.owner;
  }

  addAllowedNumber() {}

  removeAllowedNumber() {}

  bindTelegramUser() {}

  unbindTelegramUser() {}

  listTelegramBindings() {
    return [];
  }
}

test('routes natural language directly to prompt intent', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc can you fix auth tests and summarize changes');

  assert.equal(parsed.command, 'prompt');
  assert.equal(parsed.tier, 'elevated');
  assert.equal(parsed.args[0], 'can you fix auth tests and summarize changes');
});

test('routes natural language without alias to prompt intent', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('can you fix auth tests and summarize changes');

  assert.equal(parsed.command, 'prompt');
  assert.equal(parsed.tier, 'elevated');
  assert.equal(parsed.args[0], 'can you fix auth tests and summarize changes');
});

test('routes explicit slash shell command to dangerous intent', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc /run npm test');

  assert.equal(parsed.command, 'run');
  assert.equal(parsed.tier, 'dangerous');
  assert.equal(parsed.args[0], 'npm test');
});

test('routes slash commands without alias', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('/status');

  assert.equal(parsed.command, 'status');
  assert.deepEqual(parsed.args, []);
});

test('routes slash users add command', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc /users add +15551234567');

  assert.equal(parsed.command, 'users add');
  assert.equal(parsed.tier, 'safe');
  assert.equal(parsed.args[0], '+15551234567');
});

test('rejects invalid phone value in users add command parsing', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc /users add not-a-phone');

  assert.equal(parsed.command, 'users add');
  assert.equal(parsed.args[0], '');
});

test('routes slash help command', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc /help');

  assert.equal(parsed.command, 'help');
  assert.deepEqual(parsed.args, []);
});

test('routes slash pwd and cd commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const pwd = await router.parse('@oc /pwd');
  assert.equal(pwd.command, 'pwd');

  const cd = await router.parse('@oc /cd src/components');
  assert.equal(cd.command, 'cd');
  assert.equal(cd.args[0], 'src/components');
});

test('routes session use and session new commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const useCmd = await router.parse('@oc /session use abc123');
  assert.equal(useCmd.command, 'session use');
  assert.equal(useCmd.args[0], 'abc123');

  const newCmd = await router.parse('@oc /session new Release prep');
  assert.equal(newCmd.command, 'session new');
  assert.equal(newCmd.args[0], 'Release prep');
});

test('routes slash ls/find/grep commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const ls = await router.parse('@oc /ls src');
  assert.equal(ls.command, 'ls');
  assert.equal(ls.args[0], 'src');

  const find = await router.parse('@oc /find auth');
  assert.equal(find.command, 'find');
  assert.equal(find.args[0], 'auth');

  const grep = await router.parse('@oc /grep sessionId');
  assert.equal(grep.command, 'grep');
  assert.equal(grep.args[0], 'sessionId');
});

test('routes permission reply commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const perm = await router.parse('@oc /permission perm_123 always');
  assert.equal(perm.command, 'permission reply');
  assert.equal(perm.args[0], 'perm_123');
  assert.equal(perm.args[1], 'always');

  const allow = await router.parse('@oc /allow perm_abc');
  assert.equal(allow.command, 'permission reply');
  assert.equal(allow.args[0], 'perm_abc');
  assert.equal(allow.args[1], 'once');
});

test('routes run retrieval commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const runs = await router.parse('@oc /runs');
  assert.equal(runs.command, 'output runs');

  const get = await router.parse('@oc /get ABCD1234');
  assert.equal(get.command, 'output get');
  assert.equal(get.args[0], 'ABCD1234');
});

test('routes telegram binding admin commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const bind = await router.parse('@oc /users bindtg 123456789 +15551234567 alice');
  assert.equal(bind.command, 'users bindtg');
  assert.equal(bind.args[0], '123456789');
  assert.equal(bind.args[1], '+15551234567');
  assert.equal(bind.args[2], 'alice');

  const unbind = await router.parse('@oc /users unbindtg 123456789');
  assert.equal(unbind.command, 'users unbindtg');
  assert.equal(unbind.args[0], '123456789');

  const tglist = await router.parse('@oc /users tglist');
  assert.equal(tglist.command, 'users tglist');
});

test('routes model namespace commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const status = await router.parse('@oc /model status');
  assert.equal(status.command, 'model status');

  const list = await router.parse('@oc /model list');
  assert.equal(list.command, 'model list');

  const set = await router.parse('@oc /model set anthropic claude-3-5-sonnet');
  assert.equal(set.command, 'model set');
  assert.equal(set.args[0], 'anthropic');
  assert.equal(set.args[1], 'claude-3-5-sonnet');
  assert.equal(set.tier, 'dangerous');
});

test('routes tools and mcp namespace commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const toolsIds = await router.parse('@oc /tools ids');
  assert.equal(toolsIds.command, 'tools ids');

  const toolsList = await router.parse('@oc /tools list anthropic claude-3-5-sonnet');
  assert.equal(toolsList.command, 'tools list');
  assert.equal(toolsList.args[0], 'anthropic');
  assert.equal(toolsList.args[1], 'claude-3-5-sonnet');

  const mcpStatus = await router.parse('@oc /mcp status');
  assert.equal(mcpStatus.command, 'mcp status');

  const mcpAdd = await router.parse('@oc /mcp add docs npx @modelcontextprotocol/server-filesystem');
  assert.equal(mcpAdd.command, 'mcp add');
  assert.equal(mcpAdd.tier, 'dangerous');

  const mcpConnect = await router.parse('@oc /mcp connect docs');
  assert.equal(mcpConnect.command, 'mcp connect');

  const mcpDisconnect = await router.parse('@oc /mcp disconnect docs');
  assert.equal(mcpDisconnect.command, 'mcp disconnect');
});

test('routes skills and opencode diagnostic commands', async () => {
  const router = new CommandRouter(new AccessControllerStub());

  const skills = await router.parse('@oc /skills list');
  assert.equal(skills.command, 'skills list');

  const status = await router.parse('@oc /opencode status');
  assert.equal(status.command, 'opencode status');

  const providers = await router.parse('@oc /opencode providers');
  assert.equal(providers.command, 'opencode providers');

  const commands = await router.parse('@oc /opencode commands');
  assert.equal(commands.command, 'opencode commands');

  const diagnostics = await router.parse('@oc /opencode diagnostics');
  assert.equal(diagnostics.command, 'opencode diagnostics');
});

test('blocks non-owner for mutating advanced commands', async () => {
  const access = new AccessControllerStub();
  access.owner = false;
  const router = new CommandRouter(access);

  const parsed = await router.parse('@oc /model set anthropic claude-3-5-sonnet');
  assert.ok(parsed);

  const response = await router.route(
    parsed,
    {
      id: 's1',
      phoneNumber: '+15550001111',
      role: 'user',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      locked: false,
      activeSessionId: null,
      cwd: '.',
      workspaceRoot: '.',
      busy: false,
      confirmed: true,
    },
    { sender: '+15550001111', role: 'user' },
  );

  assert.equal(typeof response, 'string');
  assert.equal(String(response).includes('Only the owner'), true);
});
