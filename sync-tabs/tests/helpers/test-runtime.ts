import type {
  TabRuntime,
  PrimaryElection,
  TabTransport,
} from '../../src/communication/ports.ts';
import type { TabMessage } from '../../src/communication/protocol.ts';

/** A manually driven host: no BroadcastChannel, Web Locks, or real timers. */
export class TestRuntime implements TabRuntime {
  readonly published: TabMessage[] = [];
  transportClosed = false;
  electionLeft = false;
  heartbeatStopped = false;

  private nextId = 0;
  private time = 0;
  private receive: ((message: TabMessage) => void) | undefined;
  private onElected: (() => void) | undefined;
  private heartbeat: (() => void) | undefined;

  readonly transport: TabTransport = {
    publish: (message) => {
      this.published.push(message);
    },
    subscribe: (receive) => {
      this.receive = receive;
      return () => {
        this.receive = undefined;
      };
    },
    close: () => {
      this.transportClosed = true;
    },
  };

  readonly election: PrimaryElection = {
    join: (onElected) => {
      this.onElected = onElected;
      return () => {
        this.electionLeft = true;
        this.onElected = undefined;
      };
    },
  };

  createId(): string {
    this.nextId += 1;
    return `id-${this.nextId}`;
  }

  now(): number {
    return this.time;
  }

  every(_intervalMs: number, callback: () => void): () => void {
    this.heartbeat = callback;
    return () => {
      this.heartbeatStopped = true;
      this.heartbeat = undefined;
    };
  }

  electPrimary(): void {
    this.onElected?.();
  }

  deliver(message: TabMessage): void {
    this.receive?.(message);
  }

  heartbeatAt(time: number): void {
    this.time = time;
    this.heartbeat?.();
  }
}
