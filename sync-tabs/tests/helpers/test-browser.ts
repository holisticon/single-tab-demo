import type {
  CommunicationOptions,
  LockProvider,
  BroadcastChannelHandle,
  TabMessage,
} from '../../src/communication/tab-communication.ts';

/** Manually controlled browser APIs for lifecycle and failure tests. */
export class TestBrowser implements CommunicationOptions {
  readonly published: TabMessage[] = [];
  transportClosed = false;
  registrationReleased = false;
  sendError: Error | undefined;

  private channel: BroadcastChannelHandle | undefined;
  private lockCallback: ((lock: object | null) => Promise<void>) | undefined;
  private resolveRequest: (() => void) | undefined;
  private rejectRequest: ((error: unknown) => void) | undefined;

  readonly createChannel = (): BroadcastChannelHandle => {
    this.channel = {
      onmessage: null,
      postMessage: (message) => {
        if (this.sendError) {
          throw this.sendError;
        }
        this.published.push(message);
      },
      close: () => {
        this.transportClosed = true;
      },
    };
    return this.channel;
  };

  readonly locks: LockProvider = {
    request: (_name, _options, callback) =>
      new Promise<void>((resolve, reject) => {
        this.lockCallback = callback;
        this.resolveRequest = resolve;
        this.rejectRequest = reject;
      }),
  };

  async registerAs(isPrimary: boolean): Promise<void> {
    void this.lockCallback?.(isPrimary ? {} : null).then(() => {
      this.registrationReleased = true;
      this.resolveRequest?.();
    }, this.rejectRequest);
    await Promise.resolve();
  }

  async failRegistration(error: Error): Promise<void> {
    this.rejectRequest?.(error);
    await Promise.resolve();
  }

  deliver(message: unknown): void {
    this.channel?.onmessage?.(new MessageEvent('message', { data: message }));
  }
}
