import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MainTabConnection, type IncomingMessage } from '../src/main-tab.ts';
import { TestRuntime } from './helpers/test-runtime.ts';

test('discovery announces a tab; only election grants primary ownership', () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);

  assert.deepEqual(runtime.published, [
    {
      type: 'hello',
      senderId: connection.id,
      isMain: false,
    },
  ]);
  runtime.deliver({ type: 'main', senderId: 'existing-primary' });
  assert.equal(connection.mainId, 'existing-primary');
  assert.equal(connection.isMain, false);

  runtime.electPrimary();
  assert.equal(connection.isMain, true);
  assert.deepEqual(runtime.published.at(-1), {
    type: 'main',
    senderId: connection.id,
  });

  // A delayed announcement from a former owner cannot revoke actual ownership.
  runtime.deliver({
    type: 'presence',
    senderId: 'existing-primary',
    isMain: true,
  });
  assert.equal(connection.isMain, true);
  connection.close();
});

test('the primary processes addressed data before acknowledging it', () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const received: IncomingMessage[] = [];
  runtime.electPrimary();
  connection.subscribe({
    onMessage: (message) => {
      assert.equal(
        runtime.published.some((sent) => sent.type === 'ack'),
        false,
      );
      received.push(message);
    },
  });

  runtime.deliver({
    type: 'data',
    senderId: 'secondary',
    targetId: 'other-tab',
    id: 'ignored',
    value: 'Ignore me',
  });
  assert.equal(received.length, 0);

  runtime.deliver({
    type: 'data',
    senderId: 'secondary',
    targetId: connection.id,
    id: 'message-1',
    value: 'Hello',
  });
  assert.deepEqual(received, [
    { id: 'message-1', senderId: 'secondary', value: 'Hello' },
  ]);
  assert.deepEqual(runtime.published.at(-1), {
    type: 'ack',
    senderId: connection.id,
    targetId: 'secondary',
    id: 'message-1',
  });
  connection.close();
});

test('a secondary routes to the discovered primary and filters receipts by sender and recipient', () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const receipts: string[] = [];
  connection.subscribe({ onDelivered: (id) => receipts.push(id) });
  runtime.deliver({ type: 'main', senderId: 'primary' });
  const id = connection.send('Payload');

  assert.deepEqual(runtime.published.at(-1), {
    type: 'data',
    senderId: connection.id,
    targetId: 'primary',
    id,
    value: 'Payload',
  });
  runtime.deliver({
    type: 'ack',
    senderId: 'unrelated',
    targetId: connection.id,
    id,
  });
  runtime.deliver({
    type: 'ack',
    senderId: 'primary',
    targetId: 'another-tab',
    id,
  });
  assert.equal(receipts.length, 0);
  runtime.deliver({
    type: 'ack',
    senderId: 'primary',
    targetId: connection.id,
    id,
  });
  assert.deepEqual(receipts, [id]);
  connection.close();
});

test('expiring a peer from the display never elects a new primary', () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  runtime.deliver({ type: 'main', senderId: 'primary' });
  assert.equal(connection.peers.size, 1);

  runtime.heartbeatAt(20_000);
  assert.equal(connection.peers.size, 0);
  assert.equal(connection.mainId, 'primary');
  assert.equal(connection.isMain, false);
  connection.close();
});

test('close leaves the election, stops heartbeat, and detaches message delivery', () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  connection.close();
  connection.close();

  assert.equal(runtime.electionLeft, true);
  assert.equal(runtime.transportClosed, true);
  assert.equal(runtime.heartbeatStopped, true);
  assert.equal(
    runtime.published.filter((message) => message.type === 'bye').length,
    1,
  );
  runtime.electPrimary();
  runtime.deliver({ type: 'main', senderId: 'someone-else' });
  assert.equal(connection.mainId, null);
});
