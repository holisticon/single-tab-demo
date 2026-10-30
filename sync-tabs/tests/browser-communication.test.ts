import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MainTabConnection, type IncomingMessage } from '../src/main-tab.ts';
import {
  handoffOnStartup,
  type StartupStatus,
} from '../src/startup-handoff.ts';

import {
  createBrowserTabRuntime,
  type BrowserRuntimeOptions,
} from '../src/communication/browser-runtime.ts';
import { TestLocks } from './helpers/test-locks.ts';

function createConnection(
  key: string,
  options?: BrowserRuntimeOptions,
): MainTabConnection {
  return new MainTabConnection(createBrowserTabRuntime(key, options));
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  assert.ok(predicate(), 'Expected tab state within one second');
}

function collectMessages(connection: MainTabConnection): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  connection.subscribe({
    onMessage: (message) => messages.push(message),
  });

  return messages;
}

test('the first of simultaneous tabs becomes main and only it processes sent data', async () => {
  const key = crypto.randomUUID();
  const locks = new TestLocks();
  const first = createConnection(key, { locks });
  const second = createConnection(key, { locks });
  const third = createConnection(key, { locks });
  const firstMessages = collectMessages(first);
  const secondMessages = collectMessages(second);
  const thirdMessages = collectMessages(third);
  const deliveries: string[] = [];
  second.subscribe({
    onDelivered: (id) => deliveries.push(id),
  });

  try {
    assert.throws(() => second.send('Too early'), /connected secondary tab/);
    await until(() => second.mainId === first.id && third.mainId === first.id);
    assert.equal(first.isMain, true);
    assert.equal(second.isMain, false);
    assert.equal(third.isMain, false);
    assert.throws(() => first.send('From the main tab'), /secondary tab/);

    const id = second.send('Data from the second tab');
    await until(() => deliveries.includes(id));
    assert.deepEqual(firstMessages, [
      {
        id,
        senderId: second.id,
        value: 'Data from the second tab',
      },
    ]);
    assert.deepEqual(secondMessages, []);
    assert.deepEqual(thirdMessages, []);

    third.send('Data from the third tab');
    await until(() => firstMessages.length === 2);
    assert.equal(firstMessages[1]?.senderId, third.id);
    assert.deepEqual(secondMessages, []);
  } finally {
    first.close();
    second.close();
    third.close();
  }
});

test('closing the main tab promotes the next waiting tab and accepts new data', async () => {
  const key = crypto.randomUUID();
  const locks = new TestLocks();
  const first = createConnection(key, { locks });
  const second = createConnection(key, { locks });
  const third = createConnection(key, { locks });
  const firstMessages = collectMessages(first);
  const secondMessages = collectMessages(second);

  try {
    await until(() => second.mainId === first.id && third.mainId === first.id);
    third.send('Only the old main receives this');
    await until(() => firstMessages.length === 1);
    first.close();
    await until(() => second.isMain && third.mainId === second.id);
    assert.equal(secondMessages.length, 0);

    third.send('For the new main');
    await until(() => secondMessages.length === 1);
    assert.equal(secondMessages[0]?.value, 'For the new main');
    assert.throws(() => first.send('Closed'), /connected secondary tab/);
  } finally {
    first.close();
    second.close();
    third.close();
  }
});

test(
  'registration and takeover work with native Web Locks when available',
  {
    skip: typeof navigator.locks === 'undefined',
  },
  async () => {
    const key = crypto.randomUUID();
    const first = createConnection(key);
    const second = createConnection(key);
    const messages = collectMessages(first);

    try {
      await until(() => second.mainId === first.id);
      assert.equal(first.isMain, true);
      second.send('Through native locks');
      await until(() => messages.length === 1);
      first.close();
      await until(() => second.isMain);
    } finally {
      first.close();
      second.close();
    }
  },
);

test('closed secondary tabs leave the election queue and close is idempotent', async () => {
  const key = crypto.randomUUID();
  const locks = new TestLocks();
  const first = createConnection(key, { locks });
  const second = createConnection(key, { locks });
  const third = createConnection(key, { locks });

  try {
    await until(() => third.mainId === first.id);
    second.close();
    second.close();
    first.close();
    await until(() => third.isMain);
    assert.equal(second.isMain, false);
  } finally {
    first.close();
    second.close();
    third.close();
  }
});

test('different group keys have independent main tabs and messages', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const first = createConnection(key, { locks });
  const other = createConnection(`${key}-other`, { locks });
  const sender = createConnection(key, { locks });
  const firstMessages = collectMessages(first);
  const otherMessages = collectMessages(other);

  try {
    await until(
      () => first.isMain && other.isMain && sender.mainId === first.id,
    );
    sender.send('Only for this group');
    await until(() => firstMessages.length === 1);
    assert.deepEqual(otherMessages, []);
    assert.equal(other.peers.size, 0);
  } finally {
    first.close();
    other.close();
    sender.close();
  }
});

test('a late tab discovers the existing main without receiving past data', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const first = createConnection(key, { locks });
  const second = createConnection(key, { locks });
  const firstMessages = collectMessages(first);
  let late: MainTabConnection | undefined;

  try {
    await until(() => second.mainId === first.id);
    second.send('Earlier data');
    await until(() => firstMessages.length === 1);
    late = createConnection(key, { locks });
    const lateMessages = collectMessages(late);
    await until(() => late?.mainId === first.id);
    assert.equal(late.isMain, false);
    assert.deepEqual(lateMessages, []);
  } finally {
    first.close();
    second.close();
    late?.close();
  }
});

test('startup keeps the first instance open and closes a duplicate after acknowledgement', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const primary = createConnection(key, { locks });
  const duplicate = createConnection(key, { locks });
  const messages = collectMessages(primary);
  const primaryStates: StartupStatus[] = [];
  const duplicateStates: StartupStatus[] = [];
  let primaryCloseRequests = 0;
  let duplicateCloseRequests = 0;

  const stopPrimary = handoffOnStartup(primary, {
    message: 'First launch',
    onStatus: (status) => primaryStates.push(status),
    closeWindow: () => {
      primaryCloseRequests += 1;
    },
  });
  const stopDuplicate = handoffOnStartup(duplicate, {
    message: 'Opened from the satellite system',
    onStatus: (status) => duplicateStates.push(status),
    closeWindow: () => {
      assert.equal(messages.length, 1);
      assert.equal(duplicateStates.at(-1), 'delivered');
      duplicateCloseRequests += 1;
    },
  });

  primary.subscribe({
    onMessage: () => assert.equal(duplicateCloseRequests, 0),
  });

  try {
    await until(() => duplicateCloseRequests === 1);
    assert.deepEqual(primaryStates, ['primary']);
    assert.deepEqual(duplicateStates, ['sending', 'delivered']);
    assert.equal(primaryCloseRequests, 0);
    assert.equal(messages[0]?.value, 'Opened from the satellite system');
    assert.equal(duplicate.mainId, null);
    assert.throws(() => duplicate.send('Already detached'), /secondary tab/);

    assert.equal(duplicateCloseRequests, 1);
    assert.equal(messages.length, 1);
  } finally {
    stopPrimary();
    stopDuplicate();
    primary.close();
    duplicate.close();
  }
});

class NoAcknowledgementChannel extends BroadcastChannel {
  override postMessage(message: unknown): void {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'ack'
    ) {
      return;
    }

    super.postMessage(message);
  }
}

test('startup keeps a duplicate open if delivery is not acknowledged', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const primary = createConnection(key, {
    locks,
    Channel: NoAcknowledgementChannel,
  });
  const duplicate = createConnection(key, { locks });
  const messages = collectMessages(primary);
  const states: StartupStatus[] = [];
  let closeRequests = 0;
  let stop: (() => void) | undefined;

  try {
    await until(() => duplicate.mainId === primary.id);
    stop = handoffOnStartup(duplicate, {
      message: 'Needs a receipt',
      timeoutMs: 50,
      onStatus: (status) => states.push(status),
      closeWindow: () => {
        closeRequests += 1;
      },
    });
    await until(() => states.includes('unconfirmed'));
    assert.equal(messages.length, 1);
    assert.equal(closeRequests, 0);
    assert.deepEqual(states, ['sending', 'unconfirmed']);

    // A late receipt must not unexpectedly close the tab after the timeout.
    const receivedLateReceipt = new Promise<void>((resolve) => {
      duplicate.subscribe({ onDelivered: () => resolve() });
    });
    const channel = new BroadcastChannel(`main-tab:${key}`);
    channel.postMessage({
      type: 'ack',
      senderId: primary.id,
      targetId: duplicate.id,
      id: messages[0]?.id,
    });
    channel.close();
    await receivedLateReceipt;
    assert.equal(closeRequests, 0);
  } finally {
    stop?.();
    primary.close();
    duplicate.close();
  }
});

test('startup retains a newly promoted primary if the previous one closes during handoff', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const primary = createConnection(key, {
    locks,
    Channel: NoAcknowledgementChannel,
  });
  const duplicate = createConnection(key, { locks });
  const messages = collectMessages(primary);
  const states: StartupStatus[] = [];
  let closeRequests = 0;
  const stop = handoffOnStartup(duplicate, {
    message: 'In flight',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closeRequests += 1;
    },
  });

  try {
    await until(() => messages.length === 1);
    primary.close();
    await until(() => states.includes('primary'));
    assert.equal(duplicate.isMain, true);
    assert.deepEqual(states, ['sending', 'primary']);
    assert.equal(closeRequests, 0);
  } finally {
    stop();
    primary.close();
    duplicate.close();
  }
});

test('disposing startup handling prevents a delayed receipt from closing the tab', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const primary = createConnection(key, { locks });
  const duplicate = createConnection(key, { locks });
  let closeRequests = 0;
  let stop: (() => void) | undefined;

  try {
    await until(() => duplicate.mainId === primary.id);
    const receipt = new Promise<void>((resolve) => {
      duplicate.subscribe({ onDelivered: () => resolve() });
    });
    stop = handoffOnStartup(duplicate, {
      message: 'Cancelled handoff',
      onStatus: () => {},
      closeWindow: () => {
        closeRequests += 1;
      },
    });
    stop();
    await receipt;
    assert.equal(closeRequests, 0);
  } finally {
    stop?.();
    primary.close();
    duplicate.close();
  }
});

test('a refused window close leaves delivery confirmed and the duplicate disconnected', async () => {
  const locks = new TestLocks();
  const key = crypto.randomUUID();
  const primary = createConnection(key, { locks });
  const duplicate = createConnection(key, { locks });
  const states: StartupStatus[] = [];
  let closeRequests = 0;
  const stop = handoffOnStartup(duplicate, {
    message: 'Deliver even when closing is blocked',
    onStatus: (status) => states.push(status),
    closeWindow: () => {
      closeRequests += 1;
      throw new Error('Closing is blocked');
    },
  });

  try {
    await until(() => states.includes('delivered'));
    assert.equal(closeRequests, 1);
    assert.equal(duplicate.mainId, null);
    assert.equal(primary.isMain, true);
    primary.close();
    assert.equal(duplicate.isMain, false);
  } finally {
    stop();
    primary.close();
    duplicate.close();
  }
});
