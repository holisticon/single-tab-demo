import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TabCommunication,
  type CommunicationOptions,
} from '../src/communication/tab-communication.ts';
import { handoffOnStartup } from '../src/startup-handoff.ts';
import { TestLocks } from './helpers/test-locks.ts';

function createConnection(
  key: string,
  options?: CommunicationOptions,
): TabCommunication {
  return new TabCommunication(key, options);
}

async function until(
  predicate: () => boolean | Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(await predicate(), 'Expected state within one second');
}

test('simultaneous instances check registration and exchange only the startup payload', async () => {
  const key = `group-${Math.random()}`;
  const locks = new TestLocks();
  const published: unknown[] = [];
  class RecordingChannel extends BroadcastChannel {
    override postMessage(message: unknown): void {
      published.push(message);
      super.postMessage(message);
    }
  }
  const options = {
    locks,
    createChannel: (name: string) => new RecordingChannel(name),
  };
  const primary = createConnection(key, options);
  const duplicate = createConnection(key, options);
  const received: string[] = [];
  primary.subscribe({ onMessage: ({ value }) => received.push(value) });
  let closes = 0;
  handoffOnStartup(duplicate, {
    message: 'Hello & 世界',
    onStatus: () => {},
    closeWindow: () => {
      closes += 1;
    },
  });
  try {
    await until(() => received.length === 1);
    assert.equal(primary.isPrimary, true);
    assert.deepEqual(received, ['Hello & 世界']);
    assert.equal(closes, 1);
    assert.equal(duplicate.state, 'closed');
    assert.deepEqual(published, [{ type: 'message', value: 'Hello & 世界' }]);
    primary.close();
    assert.equal(published.length, 1);
  } finally {
    primary.close();
    duplicate.close();
  }
});

test("different groups register independently and do not receive each other's payloads", async () => {
  const key = `group-${Math.random()}`;
  const locks = new TestLocks();
  const primary = createConnection(key, { locks });
  const other = createConnection(`${key}-other`, { locks });
  const sender = createConnection(key, { locks });
  const received: string[] = [];
  let otherReceived = false;
  primary.subscribe({ onMessage: ({ value }) => received.push(value) });
  other.subscribe({
    onMessage: () => {
      otherReceived = true;
    },
  });
  try {
    await until(
      () =>
        primary.isPrimary && other.isPrimary && sender.state === 'secondary',
    );
    sender.send('Group-specific');
    await until(() => received.length === 1);
    assert.equal(otherReceived, false);
  } finally {
    primary.close();
    other.close();
    sender.close();
  }
});

test('a secondary does not take over; a future instance can register after the primary closes', async () => {
  const key = `group-${Math.random()}`;
  const locks = new TestLocks();
  const primary = createConnection(key, { locks });
  const secondary = createConnection(key, { locks });
  let next: TabCommunication | undefined;
  try {
    await until(() => primary.isPrimary && secondary.state === 'secondary');
    primary.close();
    next = createConnection(key, { locks });
    await until(() => next?.isPrimary === true);
    assert.equal(secondary.state, 'secondary');
  } finally {
    primary.close();
    secondary.close();
    next?.close();
  }
});

test(
  'native Web Locks supports the non-waiting registration check',
  {
    skip: typeof navigator.locks === 'undefined',
  },
  async () => {
    const key = `native-${Math.random()}`;
    const first = createConnection(key);
    const second = createConnection(key);
    let next: TabCommunication | undefined;
    try {
      await until(
        () => first.state !== 'checking' && second.state !== 'checking',
      );
      assert.equal([first, second].filter((tab) => tab.isPrimary).length, 1);
      assert.equal(
        [first, second].filter((tab) => tab.state === 'secondary').length,
        1,
      );
      const primary = first.isPrimary ? first : second;
      primary.close();
      await until(async () => {
        const snapshot = await navigator.locks.query();
        return !(snapshot.held ?? []).some(
          (lock) => lock.name === `main-tab:${key}`,
        );
      });
      next = createConnection(key);
      await until(() => next?.state !== 'checking');
      assert.equal(next.isPrimary, true);
    } finally {
      first.close();
      second.close();
      next?.close();
    }
  },
);
