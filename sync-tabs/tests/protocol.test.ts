import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isTabMessage,
  type TabMessage,
} from '../src/communication/protocol.ts';

test('all protocol messages survive structured cloning and runtime validation', () => {
  const messages: TabMessage[] = [
    { type: 'hello', senderId: 'a', isMain: false },
    { type: 'presence', senderId: 'a', isMain: true },
    { type: 'main', senderId: 'a' },
    { type: 'bye', senderId: 'a' },
    {
      type: 'data',
      senderId: 'a',
      targetId: 'b',
      id: 'm1',
      value: 'Hello & 世界',
    },
    { type: 'ack', senderId: 'b', targetId: 'a', id: 'm1' },
  ];

  for (const message of messages) {
    assert.ok(isTabMessage(structuredClone(message)));
  }
});

test('malformed and unknown incoming messages are rejected', () => {
  for (const message of [
    null,
    undefined,
    'hello',
    {},
    { type: 'unknown', senderId: 'a' },
    { type: 'main', senderId: 123 },
    { type: 'presence', senderId: 'a', isMain: 'yes' },
    { type: 'data', senderId: 'a', id: 'm1', value: 'No target' },
    { type: 'data', senderId: 'a', targetId: 'b', id: 'm1', value: {} },
    { type: 'ack', senderId: 'a', targetId: 'b' },
  ]) {
    assert.equal(isTabMessage(message), false);
  }
});
