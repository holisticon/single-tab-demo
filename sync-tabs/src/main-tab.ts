export interface LockProvider {
  request(
    name: string,
    options: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
}

interface MainTabOptions {
  locks?: LockProvider;
  Channel?: typeof BroadcastChannel;
}

export interface IncomingMessage {
  id: string;
  senderId: string;
  value: string;
}

interface Peer {
  lastSeen: number;
}

type ChannelMessage =
  | { type: 'hello' | 'presence'; senderId: string; isMain: boolean }
  | { type: 'main' | 'bye'; senderId: string }
  | {
      type: 'data';
      senderId: string;
      targetId: string;
      id: string;
      value: string;
    }
  | { type: 'ack'; senderId: string; targetId: string; id: string };

const HEARTBEAT_INTERVAL_MS = 4_000;
const PEER_TIMEOUT_MS = 15_000;

function isChannelMessage(value: unknown): value is ChannelMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (typeof message.senderId !== 'string') {
    return false;
  }

  switch (message.type) {
    case 'hello':
    case 'presence':
      return typeof message.isMain === 'boolean';
    case 'main':
    case 'bye':
      return true;
    case 'data':
      return (
        typeof message.targetId === 'string' &&
        typeof message.id === 'string' &&
        typeof message.value === 'string'
      );
    case 'ack':
      return (
        typeof message.targetId === 'string' && typeof message.id === 'string'
      );
    default:
      return false;
  }
}

export class MainTabConnection extends EventTarget {
  readonly id: string = crypto.randomUUID();
  readonly peers = new Map<string, Peer>();

  private readonly channel: BroadcastChannel;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly lockAbort = new AbortController();
  private releaseLock: (() => void) | undefined;
  private currentMainId: string | null = null;
  private closed = false;

  constructor(
    key: string,
    {
      locks = navigator.locks,
      Channel = BroadcastChannel,
    }: MainTabOptions = {},
  ) {
    super();

    if (!locks) {
      throw new Error('Web Locks are unavailable. Use HTTPS or localhost.');
    }

    this.channel = new Channel(`main-tab:${key}`);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      this.receive(data);
    };

    // Requests queue in arrival order. The first tab holds the lock until closed.
    void locks
      .request(
        `main-tab:${key}`,
        { signal: this.lockAbort.signal },
        async () => {
          if (this.closed) {
            return;
          }

          await new Promise<void>((resolve) => {
            this.releaseLock = resolve;
            this.currentMainId = this.id;
            this.post({ type: 'main', senderId: this.id });
            this.dispatchEvent(new Event('change'));
          });
        },
      )
      .catch((error: unknown) => {
        if (!this.closed) {
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
      });

    this.post({ type: 'hello', senderId: this.id, isMain: this.isMain });
    this.timer = setInterval(() => {
      this.post({ type: 'presence', senderId: this.id, isMain: this.isMain });

      for (const [id, peer] of this.peers) {
        if (Date.now() - peer.lastSeen > PEER_TIMEOUT_MS) {
          this.peers.delete(id);
        }
      }

      this.dispatchEvent(new Event('change'));
    }, HEARTBEAT_INTERVAL_MS);
  }

  get mainId(): string | null {
    return this.currentMainId;
  }

  get isMain(): boolean {
    return this.currentMainId === this.id;
  }

  send(value: string): string {
    if (this.closed || this.isMain || this.currentMainId === null) {
      throw new Error(
        'Only a connected secondary tab can send to the main tab.',
      );
    }

    const id = crypto.randomUUID();
    this.post({
      type: 'data',
      senderId: this.id,
      targetId: this.currentMainId,
      id,
      value,
    });

    return id;
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    clearInterval(this.timer);
    this.post({ type: 'bye', senderId: this.id });
    this.channel.close();
    this.lockAbort.abort();
    this.releaseLock?.();
    this.currentMainId = null;
  }

  private post(message: ChannelMessage): void {
    this.channel.postMessage(message);
  }

  private receive(message: unknown): void {
    if (!isChannelMessage(message) || message.senderId === this.id) {
      return;
    }

    if (message.type === 'bye') {
      this.peers.delete(message.senderId);

      if (this.currentMainId === message.senderId) {
        this.currentMainId = null;
      }
    } else {
      this.peers.set(message.senderId, { lastSeen: Date.now() });

      if (
        message.type === 'main' ||
        ((message.type === 'presence' || message.type === 'hello') &&
          message.isMain)
      ) {
        this.currentMainId = message.senderId;
      }

      if (message.type === 'hello') {
        this.post({ type: 'presence', senderId: this.id, isMain: this.isMain });
      }

      if (
        message.type === 'data' &&
        this.isMain &&
        message.targetId === this.id
      ) {
        const detail: IncomingMessage = {
          id: message.id,
          senderId: message.senderId,
          value: message.value,
        };
        this.dispatchEvent(new CustomEvent('message', { detail }));
        this.post({
          type: 'ack',
          senderId: this.id,
          targetId: message.senderId,
          id: message.id,
        });
      }

      if (
        message.type === 'ack' &&
        message.targetId === this.id &&
        message.senderId === this.currentMainId
      ) {
        this.dispatchEvent(
          new CustomEvent('delivered', { detail: message.id }),
        );
      }
    }

    this.dispatchEvent(new Event('change'));
  }
}
