import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MainTabConnection } from '../src/main-tab.ts';
import {
  handoffOnStartup,
  type StartupStatus,
} from '../src/startup-handoff.ts';
import { TestRuntime } from './helpers/test-runtime.ts';

test('registering a primary sends no inter-tab messages', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const received: string[] = [];
  connection.subscribe({ onMessage: ({ value }) => received.push(value) });
  await runtime.registerAs(true);
  assert.equal(connection.state, 'primary');
  runtime.deliver({ type: 'message', value: 'Payload' });
  assert.deepEqual(received, ['Payload']);
  assert.deepEqual(runtime.published, []);
  connection.close();
  assert.deepEqual(runtime.published, []);
});

test('a secondary sends only a payload and does not process incoming data', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  let received = false;
  connection.subscribe({
    onMessage: () => {
      received = true;
    },
  });
  assert.throws(() => connection.send('Too early'), /secondary/);
  await runtime.registerAs(false);
  connection.send('Payload');
  runtime.deliver({ type: 'message', value: 'Other data' });
  assert.equal(received, false);
  assert.deepEqual(runtime.published, [{ type: 'message', value: 'Payload' }]);
  connection.close();
  assert.throws(() => connection.send('Closed'), /secondary/);
});

test('closing during registration releases a subsequently granted lock', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  connection.close();
  connection.close();
  await runtime.registerAs(true);
  assert.equal(connection.state, 'closed');
  assert.equal(runtime.registrationReleased, true);
  assert.equal(runtime.transportClosed, true);
  assert.equal(runtime.published.length, 0);
});

test('startup keeps the primary open without sending its own startup message', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const states: StartupStatus[] = [];
  let closed = false;
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closed = true;
    },
  });
  await runtime.registerAs(true);
  assert.deepEqual(states, ['primary']);
  assert.equal(closed, false);
  assert.equal(runtime.published.length, 0);
  connection.close();
});

test('startup sends once and closes without waiting for a reply', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const states: StartupStatus[] = [];
  let closes = 0;
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closes += 1;
    },
  });
  await runtime.registerAs(false);
  assert.deepEqual(states, ['sent']);
  assert.deepEqual(runtime.published, [{ type: 'message', value: 'Startup' }]);
  assert.equal(connection.state, 'closed');
  assert.equal(closes, 1);
});

test('failed registration or sending keeps the window open', async () => {
  for (const failure of ['registration', 'send']) {
    const runtime = new TestRuntime();
    const connection = new MainTabConnection(runtime);
    const states: StartupStatus[] = [];
    let closed = false;
    handoffOnStartup(connection, {
      message: 'Startup',
      onStatus: (status) => states.push(status),
      closeWindow: () => {
        closed = true;
      },
    });
    if (failure === 'registration') {
      await runtime.failRegistration(new Error('Registration failed'));
    } else {
      runtime.sendError = new Error('Send failed');
      await runtime.registerAs(false);
    }
    assert.deepEqual(states, ['failed']);
    assert.equal(closed, false);
    connection.close();
  }
});

test('disposal prevents a pending startup check from sending or closing', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const dispose = handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: () => assert.fail('Disposed'),
    closeWindow: () => assert.fail('Disposed'),
  });
  dispose();
  await runtime.registerAs(false);
  assert.equal(runtime.published.length, 0);
  connection.close();
});

test('a blocked window close leaves the duplicate disconnected', async () => {
  const runtime = new TestRuntime();
  const connection = new MainTabConnection(runtime);
  const states: StartupStatus[] = [];
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      throw new Error('Blocked');
    },
  });
  await runtime.registerAs(false);
  assert.deepEqual(states, ['sent']);
  assert.equal(connection.state, 'closed');
  assert.equal(runtime.transportClosed, true);
});
