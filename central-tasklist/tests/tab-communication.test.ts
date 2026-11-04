import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TabCommunication } from '../src/communication/tab-communication.ts';
import {
  handoffOnStartup,
  type StartupStatus,
} from '../src/startup-handoff.ts';
import { TestBrowser } from './helpers/test-browser.ts';

test('registering a primary sends no inter-tab messages', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const received: string[] = [];
  connection.subscribe({ onMessage: ({ value }) => received.push(value) });
  await browser.registerAs(true);
  assert.equal(connection.state, 'primary');
  browser.deliver({ type: 'message', value: 'Payload' });
  assert.deepEqual(received, ['Payload']);
  assert.deepEqual(browser.published, []);
  connection.close();
  assert.deepEqual(browser.published, []);
});

test('the self-contained receiver validates data and supports unsubscribing', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const received: string[] = [];
  const unsubscribe = connection.subscribe({
    onMessage: ({ value }) => received.push(value),
  });
  await browser.registerAs(true);

  browser.deliver(null);
  browser.deliver({ type: 'old-protocol', value: 'Ignore' });
  browser.deliver({ type: 'message', value: {} });
  browser.deliver({ type: 'message', value: 'Valid payload' });
  assert.deepEqual(received, ['Valid payload']);

  unsubscribe();
  browser.deliver({ type: 'message', value: 'After unsubscribe' });
  assert.equal(received.length, 1);
  connection.close();
});

test('a secondary sends only a payload and does not process incoming data', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  let received = false;
  connection.subscribe({
    onMessage: () => {
      received = true;
    },
  });
  assert.throws(() => connection.send('Too early'), /secondary/);
  await browser.registerAs(false);
  connection.send('Payload');
  browser.deliver({ type: 'message', value: 'Other data' });
  assert.equal(received, false);
  assert.deepEqual(browser.published, [{ type: 'message', value: 'Payload' }]);
  connection.close();
  assert.throws(() => connection.send('Closed'), /secondary/);
});

test('closing during registration releases a subsequently granted lock', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  connection.close();
  connection.close();
  await browser.registerAs(true);
  assert.equal(connection.state, 'closed');
  assert.equal(browser.registrationReleased, true);
  assert.equal(browser.transportClosed, true);
  assert.equal(browser.published.length, 0);
});

test('startup keeps the primary open without sending its own startup message', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const states: StartupStatus[] = [];
  let closed = false;
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closed = true;
    },
  });
  await browser.registerAs(true);
  assert.deepEqual(states, ['primary']);
  assert.equal(closed, false);
  assert.equal(browser.published.length, 0);
  connection.close();
});

test('startup sends once and closes without waiting for a reply', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const states: StartupStatus[] = [];
  let closes = 0;
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closes += 1;
    },
  });
  await browser.registerAs(false);
  assert.deepEqual(states, ['sent']);
  assert.deepEqual(browser.published, [{ type: 'message', value: 'Startup' }]);
  assert.equal(connection.state, 'closed');
  assert.equal(closes, 1);
});

test('failed registration or sending keeps the window open', async () => {
  for (const failure of ['registration', 'send']) {
    const browser = new TestBrowser();
    const connection = new TabCommunication('test-group', browser);
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
      await browser.failRegistration(new Error('Registration failed'));
    } else {
      browser.sendError = new Error('Send failed');
      await browser.registerAs(false);
    }
    assert.deepEqual(states, ['failed']);
    assert.equal(closed, false);
    connection.close();
  }
});

test('disposal prevents a pending startup check from sending or closing', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const dispose = handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: () => assert.fail('Disposed'),
    closeWindow: () => assert.fail('Disposed'),
  });
  dispose();
  await browser.registerAs(false);
  assert.equal(browser.published.length, 0);
  connection.close();
});

test('a blocked window close leaves the duplicate disconnected', async () => {
  const browser = new TestBrowser();
  const connection = new TabCommunication('test-group', browser);
  const states: StartupStatus[] = [];
  handoffOnStartup(connection, {
    message: 'Startup',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      throw new Error('Blocked');
    },
  });
  await browser.registerAs(false);
  assert.deepEqual(states, ['sent']);
  assert.equal(connection.state, 'closed');
  assert.equal(browser.transportClosed, true);
});
