import type { TabMessage } from './protocol.ts';

export type Unsubscribe = () => void;

export interface TabTransport {
  publish(message: TabMessage): void;
  subscribe(receive: (message: TabMessage) => void): Unsubscribe;
  close(): void;
}

export interface PrimaryRegistration {
  isPrimary: boolean;
  release(): void;
}

/** Checks once, without waiting for another tab to release its registration. */
export interface PrimaryRegistry {
  tryRegister(): Promise<PrimaryRegistration>;
}

export interface TabRuntime {
  transport: TabTransport;
  registry: PrimaryRegistry;
}
