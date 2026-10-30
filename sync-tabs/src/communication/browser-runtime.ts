import { isTabMessage, type TabMessage } from './protocol.ts';
import type {
  PrimaryElection,
  TabRuntime,
  TabTransport,
  Unsubscribe,
} from './ports.ts';

export interface LockProvider {
  request(
    name: string,
    options: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
}

export interface BrowserRuntimeOptions {
  locks?: LockProvider;
  Channel?: typeof BroadcastChannel;
}

class BroadcastChannelTransport implements TabTransport {
  private readonly channel: BroadcastChannel;
  private readonly listeners = new Set<(message: TabMessage) => void>();

  constructor(name: string, Channel: typeof BroadcastChannel) {
    this.channel = new Channel(name);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (isTabMessage(data)) {
        for (const receive of this.listeners) {
          receive(data);
        }
      }
    };
  }

  publish(message: TabMessage): void {
    this.channel.postMessage(message);
  }

  subscribe(receive: (message: TabMessage) => void): Unsubscribe {
    this.listeners.add(receive);
    return () => this.listeners.delete(receive);
  }

  close(): void {
    this.listeners.clear();
    this.channel.close();
  }
}

class WebLocksPrimaryElection implements PrimaryElection {
  private readonly name: string;
  private readonly locks: LockProvider;

  constructor(name: string, locks: LockProvider) {
    this.name = name;
    this.locks = locks;
  }

  join(onElected: () => void, onError: (error: unknown) => void): Unsubscribe {
    const abort = new AbortController();
    let release: (() => void) | undefined;
    let closed = false;

    void this.locks
      .request(this.name, { signal: abort.signal }, async () => {
        if (closed) {
          return;
        }

        // Web Locks holds ownership until this callback's promise resolves.
        // Merely returning after onElected() would immediately release the lock.
        const ownershipReleased = new Promise<void>((resolve) => {
          release = resolve;
        });
        try {
          onElected();
        } catch (error) {
          onError(error);
        } finally {
          await ownershipReleased;
        }
      })
      .catch((error: unknown) => {
        if (!closed) {
          onError(error);
        }
      });

    return () => {
      closed = true;
      abort.abort(); // Cancels the request if it is still queued.
      release?.(); // Releases ownership if this tab already holds the lock.
    };
  }
}

/** The only place that binds communication logic to browser APIs. */
export function createBrowserTabRuntime(
  groupKey: string,
  {
    locks = navigator.locks,
    Channel = BroadcastChannel,
  }: BrowserRuntimeOptions = {},
): TabRuntime {
  if (!locks) {
    throw new Error('Web Locks are unavailable. Use HTTPS or localhost.');
  }

  const groupName = `main-tab:${groupKey}`;

  return {
    transport: new BroadcastChannelTransport(groupName, Channel),
    election: new WebLocksPrimaryElection(groupName, locks),
    createId: () => crypto.randomUUID(),
    now: () => Date.now(),
    every: (intervalMs, callback) => {
      const timer = setInterval(callback, intervalMs);
      return () => clearInterval(timer);
    },
  };
}
