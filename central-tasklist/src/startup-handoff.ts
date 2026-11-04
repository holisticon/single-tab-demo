import type { TabCommunication } from './communication/tab-communication.ts';

export type StartupStatus = 'primary' | 'sent' | 'failed';

interface StartupHandoffOptions {
  message: string;
  onStatus: (status: StartupStatus) => void;
  closeWindow: () => void;
}

export function handoffOnStartup(
  connection: TabCommunication,
  { message, onStatus, closeWindow }: StartupHandoffOptions,
): () => void {
  let active = true;

  function dispose(): void {
    active = false;
    unsubscribe();
  }

  function failed(): void {
    if (!active) return;
    dispose();
    onStatus('failed');
  }

  function checkRegistration(): void {
    if (!active) return;

    if (connection.state === 'primary') {
      dispose();
      onStatus('primary');
      return;
    }

    if (connection.state === 'failed') {
      failed();
      return;
    }

    if (connection.state !== 'secondary') return;

    try {
      connection.send(message);
    } catch {
      failed();
      return;
    }

    // Posting is the final protocol step. There is no acknowledgement exchange.
    dispose();
    connection.close();
    onStatus('sent');
    try {
      closeWindow();
    } catch {
      // The UI keeps a manual-close notice if the browser refuses to close.
    }
  }

  const unsubscribe = connection.subscribe({
    onChange: checkRegistration,
    onError: failed,
  });
  checkRegistration();
  return dispose;
}
