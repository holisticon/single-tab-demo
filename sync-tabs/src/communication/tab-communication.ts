/** The complete protocol: one payload, with no discovery or receipt messages. */
export interface TabMessage {
  type: 'message';
  value: string;
}

export type ConnectionState =
  | 'checking'
  | 'primary'
  | 'secondary'
  | 'closed'
  | 'failed';

export interface CommunicationObserver {
  onChange?: () => void;
  onMessage?: (message: TabMessage) => void;
  onError?: (error: unknown) => void;
}

// These two small interfaces allow tests to replace the browser APIs.
export interface LockProvider {
  request(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<void>,
  ): Promise<void>;
}

export interface BroadcastChannelHandle {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: TabMessage): void;
  close(): void;
}

export interface CommunicationOptions {
  locks?: LockProvider;
  createChannel?: (name: string) => BroadcastChannelHandle;
}

export function isTabMessage(value: unknown): value is TabMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'message' &&
    'value' in value &&
    typeof value.value === 'string'
  );
}

/**
 * Self-contained tab communication. It knows nothing about the DOM, URLs,
 * startup messages, focus, or window.close().
 *
 * 1. Open a channel, ready to receive data if registration succeeds.
 * 2. Check the Web Lock once: own it as primary, or act as a secondary.
 * 3. A secondary may send a payload; only the primary processes it.
 */
export class TabCommunication {
  private readonly channel: BroadcastChannelHandle;
  private readonly observers = new Set<CommunicationObserver>();
  private releaseRegistration: (() => void) | undefined;
  private currentState: ConnectionState = 'checking';

  constructor(
    groupKey: string,
    {
      locks = navigator.locks,
      createChannel = (name) => new BroadcastChannel(name),
    }: CommunicationOptions = {},
  ) {
    if (!locks) {
      throw new Error('Web Locks are unavailable. Use HTTPS or localhost.');
    }

    const groupName = `main-tab:${groupKey}`;

    // Open the receiver before claiming registration: a newly opened secondary
    // may post its payload as soon as it sees that this tab holds the lock.
    this.channel = createChannel(groupName);
    this.channel.onmessage = ({ data }) => {
      if (this.isPrimary && isTabMessage(data)) {
        for (const observer of this.observers) {
          observer.onMessage?.(data);
        }
      }
    };

    // ifAvailable returns null when another tab holds the lock. It never queues
    // this instance for ownership, so there is no later takeover or polling.
    void locks
      .request(groupName, { ifAvailable: true }, async (lock) => {
        if (this.currentState === 'closed') {
          return;
        }

        if (lock === null) {
          this.setState('secondary');
          return;
        }

        // The lock remains held for the lifetime of this callback's promise.
        // Returning immediately after setState('primary') would release it.
        const registrationReleased = new Promise<void>((resolve) => {
          this.releaseRegistration = resolve;
        });
        try {
          this.setState('primary');
        } finally {
          await registrationReleased;
        }
      })
      .catch((error: unknown) => {
        if (this.currentState !== 'closed') {
          this.currentState = 'failed';
          for (const observer of this.observers) {
            observer.onError?.(error);
          }
        }
      });
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get isPrimary(): boolean {
    return this.currentState === 'primary';
  }

  /** Local callbacks within this page; subscribing sends nothing to other tabs. */
  subscribe(observer: CommunicationObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  /** BroadcastChannel reaches the group; only its registered primary handles it. */
  send(value: string): void {
    if (this.currentState !== 'secondary') {
      throw new Error('Only a secondary tab can send to the primary.');
    }
    this.channel.postMessage({ type: 'message', value });
  }

  /** Disconnect the channel and release registration, without sending a message. */
  close(): void {
    if (this.currentState === 'closed') {
      return;
    }
    this.currentState = 'closed';
    this.channel.onmessage = null;
    this.channel.close();
    this.releaseRegistration?.();
    this.observers.clear();
  }

  private setState(state: 'primary' | 'secondary'): void {
    this.currentState = state;
    for (const observer of this.observers) {
      observer.onChange?.();
    }
  }
}
