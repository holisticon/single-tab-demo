import type { MainTabConnection } from './main-tab.js';

export type StartupStatus = 'primary' | 'sending' | 'delivered' | 'unconfirmed';

interface StartupHandoffOptions {
  message: string;
  onStatus: (status: StartupStatus) => void;
  closeWindow: () => void;
  timeoutMs?: number;
}

export function handoffOnStartup(
  connection: MainTabConnection,
  { message, onStatus, closeWindow, timeoutMs = 5_000 }: StartupHandoffOptions,
): () => void {
  let active = true;
  let pendingId: string | undefined;
  let timer = setTimeout(unconfirmed, timeoutMs);

  function dispose(): void {
    active = false;
    clearTimeout(timer);
    connection.removeEventListener('change', checkRole);
    connection.removeEventListener('delivered', delivered);
    connection.removeEventListener('error', unconfirmed);
  }

  function unconfirmed(): void {
    if (!active) {
      return;
    }

    dispose();
    onStatus('unconfirmed');
  }

  function checkRole(): void {
    if (!active) {
      return;
    }

    if (connection.isMain) {
      dispose();
      onStatus('primary');
      return;
    }

    if (connection.mainId === null || pendingId !== undefined) {
      return;
    }

    try {
      pendingId = connection.send(message);
      clearTimeout(timer);
      timer = setTimeout(unconfirmed, timeoutMs);
      onStatus('sending');
    } catch {
      unconfirmed();
    }
  }

  function delivered(event: Event): void {
    if (
      !active ||
      pendingId === undefined ||
      (event as CustomEvent<string>).detail !== pendingId
    ) {
      return;
    }

    // If the original primary disappeared, this tab may now own the lock.
    if (connection.isMain) {
      checkRole();
      return;
    }

    dispose();
    connection.close();
    onStatus('delivered');

    try {
      closeWindow();
    } catch {
      // The delivered state tells the user they can close this tab manually.
    }
  }

  connection.addEventListener('change', checkRole);
  connection.addEventListener('delivered', delivered);
  connection.addEventListener('error', unconfirmed);
  checkRole();

  return dispose;
}
