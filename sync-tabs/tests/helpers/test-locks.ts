import type { LockProvider } from '../../src/communication/browser-runtime.ts';

interface LockRequest {
  signal: AbortSignal;
  callback: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  abort: () => void;
  cancelled: boolean;
}

interface LockQueue {
  busy: boolean;
  requests: LockRequest[];
}

// Model FIFO exclusive Web Locks without requiring browser APIs in Node 22.
export class TestLocks implements LockProvider {
  private readonly queues = new Map<string, LockQueue>();

  request(
    name: string,
    { signal }: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    const queue = this.queues.get(name) ?? { busy: false, requests: [] };
    this.queues.set(name, queue);

    return new Promise<void>((resolve, reject) => {
      const request: LockRequest = {
        signal,
        callback,
        resolve,
        reject,
        cancelled: false,
        abort: () => {
          request.cancelled = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
      };

      signal.addEventListener('abort', request.abort, { once: true });
      queue.requests.push(request);
      this.drain(queue);
    });
  }

  private drain(queue: LockQueue): void {
    if (queue.busy) {
      return;
    }

    const request = queue.requests.shift();

    if (!request) {
      return;
    }

    request.signal.removeEventListener('abort', request.abort);

    if (request.cancelled) {
      this.drain(queue);
      return;
    }

    queue.busy = true;
    void Promise.resolve()
      .then(request.callback)
      .then(request.resolve, request.reject)
      .finally(() => {
        queue.busy = false;
        this.drain(queue);
      });
  }
}
