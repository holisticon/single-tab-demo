export interface SyncRecord {
  value: string;
  clock: number;
  writer: string;
}

export type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface SessionSyncOptions {
  storage?: SessionStorage;
  Channel?: typeof BroadcastChannel;
}

type MessageType = 'hello' | 'presence' | 'update' | 'bye';

interface SyncMessage {
  type: MessageType;
  id: string;
  record: SyncRecord | null;
}

const HEARTBEAT_INTERVAL_MS = 4_000;
const PEER_TIMEOUT_MS = 15_000;

function isSyncRecord(value: unknown): value is SyncRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Partial<SyncRecord>;

  return (
    typeof record.value === 'string' &&
    typeof record.clock === 'number' &&
    Number.isSafeInteger(record.clock) &&
    record.clock >= 0 &&
    typeof record.writer === 'string'
  );
}

function isSyncMessage(value: unknown): value is SyncMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const message = value as Partial<SyncMessage>;

  return (
    typeof message.id === 'string' &&
    (message.type === 'hello' ||
      message.type === 'presence' ||
      message.type === 'update' ||
      message.type === 'bye') &&
    (message.record === null || isSyncRecord(message.record))
  );
}

// sessionStorage is tab-local. BroadcastChannel carries snapshots to other tabs.
export class SessionSync extends EventTarget {
  readonly id: string = crypto.randomUUID();
  readonly peers = new Map<string, number>();

  private readonly key: string;
  private readonly storage: SessionStorage;
  private readonly channel: BroadcastChannel;
  private readonly timer: ReturnType<typeof setInterval>;
  private currentRecord: SyncRecord | null = null;

  constructor(
    key: string,
    {
      storage = sessionStorage,
      Channel = BroadcastChannel,
    }: SessionSyncOptions = {},
  ) {
    super();
    this.key = key;
    this.storage = storage;

    try {
      const saved: unknown = JSON.parse(storage.getItem(key) ?? 'null');

      if (isSyncRecord(saved)) {
        this.currentRecord = saved;
      }
    } catch {
      // Ignore unrelated or malformed values under the selected key.
    }

    this.channel = new Channel(`tab-sync:${key}`);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      this.receive(data);
    };
    this.send('hello');
    this.timer = setInterval(() => {
      this.send('presence');

      for (const [id, lastSeen] of this.peers) {
        if (Date.now() - lastSeen > PEER_TIMEOUT_MS) {
          this.peers.delete(id);
        }
      }

      this.dispatchEvent(new Event('presence'));
    }, HEARTBEAT_INTERVAL_MS);
  }

  get record(): Readonly<SyncRecord> | null {
    return this.currentRecord;
  }

  set(value: string): void {
    const record: SyncRecord = {
      value,
      clock: Math.max(Date.now(), (this.currentRecord?.clock ?? 0) + 1),
      writer: this.id,
    };

    this.storage.setItem(this.key, JSON.stringify(record));
    this.currentRecord = record;
    this.send('update');
    this.dispatchEvent(new Event('change'));
  }

  close(): void {
    clearInterval(this.timer);
    this.send('bye');
    this.channel.close();
  }

  private send(type: MessageType): void {
    const message: SyncMessage = {
      type,
      id: this.id,
      record: this.currentRecord,
    };

    this.channel.postMessage(message);
  }

  private receive(message: unknown): void {
    if (!isSyncMessage(message) || message.id === this.id) {
      return;
    }

    if (message.type === 'bye') {
      this.peers.delete(message.id);
    } else {
      this.peers.set(message.id, Date.now());

      const next = message.record;
      const previous = this.currentRecord;
      const isNewer =
        next !== null &&
        (previous === null ||
          next.clock > previous.clock ||
          (next.clock === previous.clock && next.writer > previous.writer));

      if (isNewer) {
        try {
          this.storage.setItem(this.key, JSON.stringify(next));
          this.currentRecord = next;
          this.dispatchEvent(new Event('change'));
        } catch {
          this.dispatchEvent(new Event('storageerror'));
        }
      }

      if (message.type === 'hello') {
        this.send('presence');
      }
    }

    this.dispatchEvent(new Event('presence'));
  }
}
