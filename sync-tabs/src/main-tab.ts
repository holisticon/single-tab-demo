import type {
  PrimaryRegistration,
  TabRuntime,
  Unsubscribe,
} from './communication/ports.ts';
import type { TabMessage } from './communication/protocol.ts';

export type ConnectionState =
  | 'checking'
  | 'primary'
  | 'secondary'
  | 'closed'
  | 'failed';

export interface ConnectionObserver {
  onChange?: () => void;
  onMessage?: (message: TabMessage) => void;
  onError?: (error: unknown) => void;
}

/** Check registration once; only the primary processes incoming payloads. */
export class MainTabConnection {
  private readonly runtime: TabRuntime;
  private readonly observers = new Set<ConnectionObserver>();
  private readonly unsubscribeMessages: Unsubscribe;
  private registration: PrimaryRegistration | undefined;
  private currentState: ConnectionState = 'checking';

  constructor(runtime: TabRuntime) {
    this.runtime = runtime;
    this.unsubscribeMessages = runtime.transport.subscribe((message) => {
      if (this.isMain) {
        for (const observer of this.observers) observer.onMessage?.(message);
      }
    });

    void runtime.registry
      .tryRegister()
      .then((registration) => {
        if (this.currentState === 'closed') {
          registration.release();
          return;
        }

        this.registration = registration;
        this.currentState = registration.isPrimary ? 'primary' : 'secondary';
        for (const observer of this.observers) observer.onChange?.();
      })
      .catch((error: unknown) => {
        if (this.currentState !== 'closed') {
          this.currentState = 'failed';
          for (const observer of this.observers) observer.onError?.(error);
        }
      });
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get isMain(): boolean {
    return this.currentState === 'primary';
  }

  subscribe(observer: ConnectionObserver): Unsubscribe {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  send(value: string): void {
    if (this.currentState !== 'secondary') {
      throw new Error('Only a secondary tab can send to the primary.');
    }
    this.runtime.transport.publish({ type: 'message', value });
  }

  close(): void {
    if (this.currentState === 'closed') return;
    this.currentState = 'closed';
    this.unsubscribeMessages();
    this.runtime.transport.close();
    this.registration?.release();
    this.observers.clear();
  }
}
