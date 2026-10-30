import type { LockProvider } from '../../src/communication/tab-communication.ts';

/** Models a non-waiting registration check, not a queue or takeover election. */
export class TestLocks implements LockProvider {
  private readonly held = new Set<string>();

  async request(
    name: string,
    _options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<void>,
  ): Promise<void> {
    // Browser lock checks run in a later task, after pending releases settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (this.held.has(name)) {
      await callback(null);
      return;
    }

    this.held.add(name);
    try {
      await callback({});
    } finally {
      this.held.delete(name);
    }
  }
}
