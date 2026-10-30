import type { TabRuntime, Unsubscribe } from './communication/ports.ts';
import type { TabMessage } from './communication/protocol.ts';

export interface IncomingMessage {
  id: string;
  senderId: string;
  value: string;
}

export interface ConnectionObserver {
  onChange?: () => void;
  onMessage?: (message: IncomingMessage) => void;
  onDelivered?: (messageId: string) => void;
  onError?: (error: unknown) => void;
}

interface Peer {
  lastSeen: number;
}

const HEARTBEAT_INTERVAL_MS = 4_000;
const PEER_TIMEOUT_MS = 15_000;

/** Coordinates roles and delivery. Browser details live behind TabRuntime. */
export class MainTabConnection {
  readonly id: string;
  readonly peers = new Map<string, Peer>();

  private readonly runtime: TabRuntime;
  private readonly observers = new Set<ConnectionObserver>();
  private readonly unsubscribeMessages: Unsubscribe;
  private readonly leaveElection: Unsubscribe;
  private readonly stopHeartbeat: Unsubscribe;
  private currentMainId: string | null = null;
  private closed = false;

  constructor(runtime: TabRuntime) {
    this.runtime = runtime;
    this.id = runtime.createId();
    this.unsubscribeMessages = runtime.transport.subscribe((message) => {
      this.receive(message);
    });
    this.leaveElection = runtime.election.join(
      () => this.becomePrimary(),
      (error) => {
        if (!this.closed) {
          for (const observer of this.observers) {
            observer.onError?.(error);
          }
        }
      },
    );

    // Discovery and election are separate: hello asks who owns the lock;
    // receiving a hello never grants primary ownership.
    this.announce('hello');
    this.stopHeartbeat = runtime.every(HEARTBEAT_INTERVAL_MS, () => {
      this.announce('presence');
      this.expireInactivePeers();
      this.notifyChange();
    });
  }

  get mainId(): string | null {
    return this.currentMainId;
  }

  get isMain(): boolean {
    return this.currentMainId === this.id;
  }

  subscribe(observer: ConnectionObserver): Unsubscribe {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  send(value: string): string {
    if (this.closed || this.isMain || this.currentMainId === null) {
      throw new Error(
        'Only a connected secondary tab can send to the main tab.',
      );
    }

    const id = this.runtime.createId();
    this.runtime.transport.publish({
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
    this.stopHeartbeat();
    this.runtime.transport.publish({ type: 'bye', senderId: this.id });
    this.unsubscribeMessages();
    this.runtime.transport.close();
    this.leaveElection();
    this.currentMainId = null;
    this.observers.clear();
  }

  private becomePrimary(): void {
    if (this.closed) {
      return;
    }

    this.currentMainId = this.id;
    this.runtime.transport.publish({ type: 'main', senderId: this.id });
    this.notifyChange();
  }

  private announce(type: 'hello' | 'presence'): void {
    this.runtime.transport.publish({
      type,
      senderId: this.id,
      isMain: this.isMain,
    });
  }

  private receive(message: TabMessage): void {
    if (this.closed || message.senderId === this.id) {
      return;
    }

    if (message.type !== 'bye') {
      this.peers.set(message.senderId, { lastSeen: this.runtime.now() });
    }

    switch (message.type) {
      case 'hello':
      case 'presence':
        this.rememberPrimary(message.senderId, message.isMain);
        if (message.type === 'hello') {
          this.announce('presence');
        }
        break;
      case 'main':
        this.rememberPrimary(message.senderId, true);
        break;
      case 'bye':
        this.removePeer(message.senderId);
        break;
      case 'data':
        this.receiveData(message);
        break;
      case 'ack':
        this.receiveAcknowledgement(message);
        break;
    }

    this.notifyChange();
  }

  private rememberPrimary(senderId: string, isPrimary: boolean): void {
    // An announcement cannot revoke this tab's actual lock ownership.
    if (isPrimary && !this.isMain) {
      this.currentMainId = senderId;
    }
  }

  private receiveData(message: Extract<TabMessage, { type: 'data' }>): void {
    if (!this.isMain || message.targetId !== this.id) {
      return;
    }

    const incoming: IncomingMessage = {
      id: message.id,
      senderId: message.senderId,
      value: message.value,
    };
    for (const observer of this.observers) {
      observer.onMessage?.(incoming);
    }

    // A receipt is sent after processing, not merely after seeing a broadcast.
    this.runtime.transport.publish({
      type: 'ack',
      senderId: this.id,
      targetId: message.senderId,
      id: message.id,
    });
  }

  private receiveAcknowledgement(
    message: Extract<TabMessage, { type: 'ack' }>,
  ): void {
    if (
      message.targetId === this.id &&
      message.senderId === this.currentMainId
    ) {
      for (const observer of this.observers) {
        observer.onDelivered?.(message.id);
      }
    }
  }

  private removePeer(id: string): void {
    this.peers.delete(id);
    if (this.currentMainId === id) {
      this.currentMainId = null;
    }
  }

  private expireInactivePeers(): void {
    // Heartbeats affect the display only. Missing one must not elect a primary.
    for (const [id, peer] of this.peers) {
      if (this.runtime.now() - peer.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
      }
    }
  }

  private notifyChange(): void {
    for (const observer of this.observers) {
      observer.onChange?.();
    }
  }
}
