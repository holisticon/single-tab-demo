import { isTabMessage, type TabMessage } from './protocol.ts';
import type {
  PrimaryRegistration,
  PrimaryRegistry,
  TabRuntime,
  TabTransport,
  Unsubscribe,
} from './ports.ts';

export interface LockProvider {
  request(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<void>,
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
        for (const receive of this.listeners) receive(data);
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

class WebLocksPrimaryRegistry implements PrimaryRegistry {
  private readonly name: string;
  private readonly locks: LockProvider;

  constructor(name: string, locks: LockProvider) {
    this.name = name;
    this.locks = locks;
  }

  tryRegister(): Promise<PrimaryRegistration> {
    return new Promise<PrimaryRegistration>((resolve, reject) => {
      void this.locks
        .request(this.name, { ifAvailable: true }, async (lock) => {
          if (lock === null) {
            // Another tab already owns the registration. Do not queue for takeover.
            resolve({ isPrimary: false, release: () => {} });
            return;
          }

          // Keep registration until close() resolves this promise or the tab exits.
          await new Promise<void>((release) => {
            resolve({ isPrimary: true, release });
          });
        })
        .catch(reject);
    });
  }
}

/** Browser interaction is limited to one registration check and a data channel. */
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
    registry: new WebLocksPrimaryRegistry(groupName, locks),
  };
}
