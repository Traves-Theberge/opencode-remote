import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFormatter } from '../src/presentation/formatter.js';

test('formatPromptResult filters OpenCode event JSON lines', () => {
  const formatter = new MessageFormatter();
  const response = [
    '{"type":"step-start","id":"x"}',
    '{"type":"reasoning","text":"thinking"}',
    'Final user-facing answer.',
  ].join('\n');

  const output = formatter.formatPromptResult({
    sessionId: 'ses_test',
    messageId: 'msg_test',
    response,
  });

  assert.equal(output.includes('step-start'), false);
  assert.equal(output.includes('reasoning'), false);
  assert.equal(output.includes('Final user-facing answer.'), true);
});
