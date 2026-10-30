import {
  TabCommunication,
  type TabMessage,
} from './communication/tab-communication.ts';
import { handoffOnStartup, type StartupStatus } from './startup-handoff.ts';

function getElement<T extends HTMLElement>(
  id: string,
  elementType: new () => T,
): T {
  const element = document.getElementById(id);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing or invalid element: ${id}`);
  }

  return element;
}

const handoffNotice = getElement('handoff-notice', HTMLParagraphElement);
const statusLabel = getElement('status', HTMLSpanElement);
const updatedLabel = getElement('updated', HTMLSpanElement);
const errorMessage = getElement('error', HTMLParagraphElement);
const satelliteLink = getElement('open-satellite', HTMLAnchorElement);
const inbox = getElement('inbox', HTMLElement);
const messageList = getElement('messages', HTMLDivElement);
const emptyInbox = getElement('empty-inbox', HTMLParagraphElement);
const receivedCount = getElement('received-count', HTMLSpanElement);
const originalTitle = document.title;

let connection: TabCommunication | undefined;
let disposeHandoff: (() => void) | undefined;
let startupStatus: StartupStatus | undefined;
let messageCount = 0;
let unreadCount = 0;

const params = new URL(window.location.href).searchParams;
const groupKey = params.get('key')?.trim() || 'main-tab-demo';
const startupMessage =
  params.get('message') ||
  'Another instance of Central Single Tab Application was opened.';

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  statusLabel.textContent = 'Unavailable';
}

function updateTitle(): void {
  const role =
    startupStatus === 'sent'
      ? 'Sent'
      : connection
        ? connection.isPrimary
          ? 'Primary'
          : connection.state === 'secondary'
            ? 'Secondary'
            : 'Connecting'
        : undefined;
  const title = role ? `${role} | ${originalTitle}` : originalTitle;
  document.title = unreadCount > 0 ? `(${unreadCount}) ${title}` : title;
}

function render(): void {
  updateTitle();

  const isPrimary = connection?.isPrimary ?? false;
  statusLabel.textContent =
    startupStatus === 'sent'
      ? 'Message sent'
      : isPrimary
        ? 'Primary tab'
        : connection?.state === 'secondary'
          ? 'Secondary tab'
          : startupStatus === 'failed'
            ? 'Failed'
            : 'Checking registration';
  handoffNotice.hidden = isPrimary;
  inbox.hidden = !isPrimary;
}

function receiveMessage(message: TabMessage): void {
  const item = document.createElement('article');
  item.className = 'received-message';

  const content = document.createElement('p');
  content.textContent = message.value;
  item.append(content);
  messageList.prepend(item);

  // Keep the demo's in-memory inbox bounded.
  if (messageList.childElementCount > 100) {
    messageList.lastElementChild?.remove();
  }

  messageCount += 1;
  receivedCount.textContent = String(messageCount);
  emptyInbox.hidden = true;

  try {
    window.focus();
  } catch {
    // A denied focus request must not interrupt message handling.
  }

  if (document.visibilityState !== 'visible' || !document.hasFocus()) {
    unreadCount += 1;
    updateTitle();
  }
}

function resetUnreadCount(): void {
  unreadCount = 0;
  updateTitle();
}

function markMessagesRead(): void {
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    resetUnreadCount();
  }
}

function disconnect(): void {
  disposeHandoff?.();
  disposeHandoff = undefined;
  connection?.close();
  connection = undefined;
  resetUnreadCount();
}

function connect(): void {
  disconnect();
  startupStatus = undefined;
  errorMessage.hidden = true;
  messageList.replaceChildren();
  messageCount = 0;
  receivedCount.textContent = '0';
  emptyInbox.hidden = false;
  updatedLabel.textContent = 'Checking registration';
  handoffNotice.textContent = 'Checking primary registration.';

  try {
    connection = new TabCommunication(groupKey);
    connection.subscribe({
      onChange: render,
      onMessage: receiveMessage,
      onError: () => showError('Registration failed. Reload to retry.'),
    });

    const url = new URL(window.location.href);
    url.searchParams.set('key', groupKey);
    window.history.replaceState(null, '', url);
    render();
    disposeHandoff = handoffOnStartup(connection, {
      message: startupMessage,
      closeWindow: () => window.close(),
      onStatus: (status) => {
        startupStatus = status;

        switch (status) {
          case 'primary':
            updatedLabel.textContent = 'Primary registered';
            break;
          case 'sent':
            disconnect();
            updatedLabel.textContent = 'Message sent';
            handoffNotice.textContent =
              'Sent. Close this tab manually if it remains open.';
            break;
          case 'failed':
            updatedLabel.textContent = 'Registration or send failed';
            handoffNotice.textContent =
              'Unable to register or send. Reload to retry.';
            break;
        }

        render();
      },
    });
  } catch {
    showError(
      'Web Locks or BroadcastChannel unavailable. Use HTTPS or localhost in a supported browser.',
    );
  }
}

satelliteLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.open(
    satelliteLink.href,
    '_blank',
    'popup,width=1100,height=800,noopener,noreferrer',
  );
});

window.addEventListener('pagehide', disconnect);
window.addEventListener('focus', markMessagesRead);
document.addEventListener('visibilitychange', markMessagesRead);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    connect();
  }
});

connect();
