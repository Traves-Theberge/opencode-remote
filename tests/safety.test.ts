import test from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/safety/engine.js';

test('allows simple shell commands', () => {
  const safety = new SafetyEngine();
  const result = safety.evaluate({ type: 'shell', command: 'npm test' });
  assert.equal(result.allowed, true);
});

test('blocks dangerous shell chaining with semicolon', () => {
  const safety = new SafetyEngine();
  const result = safety.evaluate({ type: 'shell', command: 'npm test; rm -rf /' });
  assert.equal(result.allowed, false);
});

test('blocks subshell execution syntax', () => {
  const safety = new SafetyEngine();
  const result = safety.evaluate({ type: 'run', command: 'echo $(cat /etc/passwd)' });
  assert.equal(result.allowed, false);
});

test('blocks empty commands', () => {
  const safety = new SafetyEngine();
  const result = safety.evaluate({ type: 'shell', command: '   ' });
  assert.equal(result.allowed, false);
});
