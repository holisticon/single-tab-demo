import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MainTabConnection,
  type IncomingMessage,
  type LockProvider,
} from '../src/main-tab.ts';
import {
  handoffOnStartup,
  type StartupStatus,
} from '../src/startup-handoff.ts';

interface LockRequest {
  signal: AbortSignal;
  callback: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  abort: () => void;
  cancelled: boolean;
}

interface LockQueue {
  busy: boolean;
  requests: LockRequest[];
}

// Model FIFO exclusive Web Locks without requiring browser APIs in Node 22.
class TestLocks implements LockProvider {
  private readonly queues = new Map<string, LockQueue>();

  request(
    name: string,
    { signal }: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    const queue = this.queues.get(name) ?? { busy: false, requests: [] };
    this.queues.set(name, queue);

    return new Promise<void>((resolve, reject) => {
      const request: LockRequest = {
        signal,
        callback,
        resolve,
        reject,
        cancelled: false,
        abort: () => {
          request.cancelled = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
      };

      signal.addEventListener('abort', request.abort, { once: true });
      queue.requests.push(request);
      this.drain(queue);
    });
  }

  private drain(queue: LockQueue): void {
    if (queue.busy) {
      return;
    }

    const request = queue.requests.shift();

    if (!request) {
      return;
    }

    request.signal.removeEventListener('abort', request.abort);

    if (request.cancelled) {
      this.drain(queue);
      return;
    }

    queue.busy = true;
    void Promise.resolve()
      .then(request.callback)
      .then(request.resolve, request.reject)
      .finally(() => {
        queue.busy = false;
        this.drain(queue);
      });
  }
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
  connection.addEventListener('message', (event) => {
    messages.push((event as CustomEvent<IncomingMessage>).detail);
  });

  return messages;
}

test('the first of simultaneous tabs becomes main and only it processes sent data', async () => {
  const key = crypto.randomUUID();
  const locks = new TestLocks();
  const first = new MainTabConnection(key, { locks });
  const second = new MainTabConnection(key, { locks });
  const third = new MainTabConnection(key, { locks });
  const firstMessages = collectMessages(first);
  const secondMessages = collectMessages(second);
  const thirdMessages = collectMessages(third);
  const deliveries: string[] = [];
  second.addEventListener('delivered', (event) => {
    deliveries.push((event as CustomEvent<string>).detail);
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
  const first = new MainTabConnection(key, { locks });
  const second = new MainTabConnection(key, { locks });
  const third = new MainTabConnection(key, { locks });
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
    const first = new MainTabConnection(key);
    const second = new MainTabConnection(key);
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
  const first = new MainTabConnection(key, { locks });
  const second = new MainTabConnection(key, { locks });
  const third = new MainTabConnection(key, { locks });

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
  const first = new MainTabConnection(key, { locks });
  const other = new MainTabConnection(`${key}-other`, { locks });
  const sender = new MainTabConnection(key, { locks });
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
  const first = new MainTabConnection(key, { locks });
  const second = new MainTabConnection(key, { locks });
  const firstMessages = collectMessages(first);
  let late: MainTabConnection | undefined;

  try {
    await until(() => second.mainId === first.id);
    second.send('Earlier data');
    await until(() => firstMessages.length === 1);
    late = new MainTabConnection(key, { locks });
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
  const primary = new MainTabConnection(key, { locks });
  const duplicate = new MainTabConnection(key, { locks });
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

  primary.addEventListener('message', () => {
    assert.equal(duplicateCloseRequests, 0);
  });

  try {
    await until(() => duplicateCloseRequests === 1);
    assert.deepEqual(primaryStates, ['primary']);
    assert.deepEqual(duplicateStates, ['sending', 'delivered']);
    assert.equal(primaryCloseRequests, 0);
    assert.equal(messages[0]?.value, 'Opened from the satellite system');
    assert.equal(duplicate.mainId, null);
    assert.throws(() => duplicate.send('Already detached'), /secondary tab/);

    duplicate.dispatchEvent(new Event('change'));
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
  const primary = new MainTabConnection(key, {
    locks,
    Channel: NoAcknowledgementChannel,
  });
  const duplicate = new MainTabConnection(key, { locks });
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
    duplicate.dispatchEvent(
      new CustomEvent('delivered', {
        detail: messages[0]?.id,
      }),
    );
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
  const primary = new MainTabConnection(key, {
    locks,
    Channel: NoAcknowledgementChannel,
  });
  const duplicate = new MainTabConnection(key, { locks });
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
  const primary = new MainTabConnection(key, { locks });
  const duplicate = new MainTabConnection(key, { locks });
  let closeRequests = 0;
  let stop: (() => void) | undefined;

  try {
    await until(() => duplicate.mainId === primary.id);
    const receipt = new Promise<void>((resolve) => {
      duplicate.addEventListener('delivered', () => resolve(), { once: true });
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
  const primary = new MainTabConnection(key, { locks });
  const duplicate = new MainTabConnection(key, { locks });
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
