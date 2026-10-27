import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionSync, type SessionStorage } from '../src/sync.ts';

function createStorage(): SessionStorage {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  assert.ok(predicate(), 'Expected state to converge within one second');
}

test('tabs synchronize, hydrate new tabs, restore reloads, clear, and isolate keys', async () => {
  const key = crypto.randomUUID();
  const firstStorage = createStorage();
  const secondStorage = createStorage();
  const tabs: SessionSync[] = [];

  function createTab(
    name: string,
    storage: SessionStorage = createStorage(),
  ): SessionSync {
    const tab = new SessionSync(name, { storage });
    tabs.push(tab);

    return tab;
  }

  try {
    const first = createTab(key, firstStorage);
    first.set('Hello from tab A');

    const second = createTab(key, secondStorage);
    const isolated = createTab(`${key}-other`);

    await until(() => second.record?.value === 'Hello from tab A');
    assert.equal(secondStorage.getItem(key), JSON.stringify(second.record));
    assert.equal(first.peers.size, 1);

    second.set('Hello back from B');
    await until(() => first.record?.value === 'Hello back from B');
    assert.equal(isolated.record, null);

    const late = createTab(key);
    await until(() => late.record?.value === 'Hello back from B');

    second.close();
    tabs.splice(tabs.indexOf(second), 1);

    const reloaded = createTab(key, secondStorage);
    assert.equal(reloaded.record?.value, 'Hello back from B');

    first.set('');
    await until(
      () => reloaded.record?.value === '' && late.record?.value === '',
    );
    assert.equal(secondStorage.getItem(key), JSON.stringify(reloaded.record));
  } finally {
    for (const tab of tabs) {
      tab.close();
    }
  }
});

test('simultaneous edits converge without message loops', async () => {
  const key = crypto.randomUUID();
  const first = new SessionSync(key, { storage: createStorage() });
  const second = new SessionSync(key, { storage: createStorage() });

  try {
    first.set('A');
    second.set('B');

    await until(() => first.record?.writer === second.record?.writer);
    assert.deepEqual(first.record, second.record);
  } finally {
    first.close();
    second.close();
  }
});

test('failed storage writes do not publish unsaved state', () => {
  const tab = new SessionSync(crypto.randomUUID(), {
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    },
  });

  try {
    assert.throws(() => tab.set('cannot save'), /Quota exceeded/);
    assert.equal(tab.record, null);
  } finally {
    tab.close();
  }
});
