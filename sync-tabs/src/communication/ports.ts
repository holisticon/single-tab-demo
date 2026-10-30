import type { TabMessage } from './protocol.ts';

export type Unsubscribe = () => void;

/** Broadcasts asynchronously to the group; the coordinator checks targetId. */
export interface TabTransport {
  publish(message: TabMessage): void;
  subscribe(receive: (message: TabMessage) => void): Unsubscribe;
  close(): void;
}

/** Grants ownership asynchronously. Unsubscribing cancels or releases it. */
export interface PrimaryElection {
  join(onElected: () => void, onError: (error: unknown) => void): Unsubscribe;
}

/** Host capabilities injected into the coordinator, including its clock. */
export interface TabRuntime {
  transport: TabTransport;
  election: PrimaryElection;
  createId(): string;
  now(): number;
  every(intervalMs: number, callback: () => void): Unsubscribe;
}
