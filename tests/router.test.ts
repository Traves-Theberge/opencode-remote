import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRouter } from '../src/router/index.js';

class AccessControllerStub {
  sessions = new Map();

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
    return true;
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

test('routes explicit slash shell command to dangerous intent', async () => {
  const router = new CommandRouter(new AccessControllerStub());
  const parsed = await router.parse('@oc /run npm test');

  assert.equal(parsed.command, 'run');
  assert.equal(parsed.tier, 'dangerous');
  assert.equal(parsed.args[0], 'npm test');
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
