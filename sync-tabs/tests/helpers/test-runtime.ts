import type {
  PrimaryRegistration,
  TabRuntime,
  TabTransport,
} from '../../src/communication/ports.ts';
import type { TabMessage } from '../../src/communication/protocol.ts';

export class TestRuntime implements TabRuntime {
  readonly published: TabMessage[] = [];
  transportClosed = false;
  registrationReleased = false;
  sendError: Error | undefined;

  private receive: ((message: TabMessage) => void) | undefined;
  private resolveRegistration:
    | ((registration: PrimaryRegistration) => void)
    | undefined;
  private rejectRegistration: ((error: Error) => void) | undefined;

  readonly transport: TabTransport = {
    publish: (message) => {
      if (this.sendError) throw this.sendError;
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

  readonly registry = {
    tryRegister: () =>
      new Promise<PrimaryRegistration>((resolve, reject) => {
        this.resolveRegistration = resolve;
        this.rejectRegistration = reject;
      }),
  };

  async registerAs(isPrimary: boolean): Promise<void> {
    this.resolveRegistration?.({
      isPrimary,
      release: () => {
        this.registrationReleased = true;
      },
    });
    await Promise.resolve();
  }

  async failRegistration(error: Error): Promise<void> {
    this.rejectRegistration?.(error);
    await Promise.resolve();
    await Promise.resolve();
  }

  deliver(message: TabMessage): void {
    this.receive?.(message);
  }
}
