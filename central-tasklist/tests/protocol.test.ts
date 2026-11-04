import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTabMessage } from '../src/communication/tab-communication.ts';

test('the payload is the only supported inter-tab message', () => {
  assert.ok(isTabMessage({ type: 'message', value: 'Hello & 世界' }));
  assert.ok(isTabMessage({ type: 'message', value: '' }));
  for (const value of [
    null,
    undefined,
    'text',
    {},
    { type: 'message', value: {} },
    { type: 'message' },
    ...['hello', 'presence', 'main', 'bye', 'data', 'ack'].map((type) => ({
      type,
      value: 'Old protocol',
    })),
  ])
    assert.equal(isTabMessage(value), false);
});
