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
const businessApplicationLink = getElement(
  'open-business-application',
  HTMLAnchorElement,
);
const inbox = getElement('inbox', HTMLElement);
const openedUrls = getElement('opened-urls', HTMLDivElement);
const emptyInbox = getElement('empty-inbox', HTMLParagraphElement);
const openedUrlCountLabel = getElement('opened-url-count', HTMLSpanElement);
const originalTitle = document.title;

let connection: TabCommunication | undefined;
let disposeHandoff: (() => void) | undefined;
let startupStatus: StartupStatus | undefined;
let openedUrlCount = 0;
let unreadCount = 0;

const initialUrl = new URL(window.location.href);
const relativeUrl = initialUrl.pathname + initialUrl.search + initialUrl.hash;
const params = initialUrl.searchParams;
const groupKey = params.get('key')?.trim() || 'main-tab-demo';

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
      ? 'URL sent'
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

function addOpenedUrl(url: string): void {
  const item = document.createElement('article');
  item.className = 'opened-url';

  const content = document.createElement('p');
  content.textContent = url;
  item.append(content);
  openedUrls.prepend(item);

  // Keep the in-memory list bounded.
  if (openedUrls.childElementCount > 100) {
    openedUrls.lastElementChild?.remove();
  }

  openedUrlCount += 1;
  openedUrlCountLabel.textContent = String(openedUrlCount);
  emptyInbox.hidden = true;
}

function receiveMessage(message: TabMessage): void {
  addOpenedUrl(message.value);

  try {
    window.history.pushState(null, '', message.value);
  } catch {
    errorMessage.textContent =
      'Unable to update the address for the opened URL.';
    errorMessage.hidden = false;
  }

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
  openedUrls.replaceChildren();
  openedUrlCount = 0;
  openedUrlCountLabel.textContent = '0';
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
      message: relativeUrl,
      closeWindow: () => window.close(),
      onStatus: (status) => {
        startupStatus = status;

        switch (status) {
          case 'primary':
            addOpenedUrl(relativeUrl);
            updatedLabel.textContent = 'Primary registered';
            break;
          case 'sent':
            disconnect();
            updatedLabel.textContent = 'URL sent';
            handoffNotice.textContent =
              'URL sent. Close this tab manually if it remains open.';
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

businessApplicationLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.open(
    businessApplicationLink.href,
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
