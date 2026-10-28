import { MainTabConnection, type IncomingMessage } from './main-tab.js';
import { handoffOnStartup, type StartupStatus } from './startup-handoff.js';

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

const keyForm = getElement('key-form', HTMLFormElement);
const keyInput = getElement('key', HTMLInputElement);
const handoffNotice = getElement('handoff-notice', HTMLParagraphElement);
const statusLabel = getElement('status', HTMLSpanElement);
const updatedLabel = getElement('updated', HTMLSpanElement);
const tabCount = getElement('count', HTMLSpanElement);
const tabList = getElement('tabs', HTMLDivElement);
const errorMessage = getElement('error', HTMLParagraphElement);
const openButton = getElement('open', HTMLButtonElement);
const satelliteLink = getElement('open-satellite', HTMLAnchorElement);
const inbox = getElement('inbox', HTMLElement);
const messageList = getElement('messages', HTMLDivElement);
const emptyInbox = getElement('empty-inbox', HTMLParagraphElement);
const receivedCount = getElement('received-count', HTMLSpanElement);
const originalTitle = document.title;

let connection: MainTabConnection | undefined;
let disposeHandoff: (() => void) | undefined;
let startupStatus: StartupStatus | undefined;
let messageCount = 0;
let unreadCount = 0;

const params = new URL(window.location.href).searchParams;
keyInput.value = params.get('key') || 'main-tab-demo';
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
    startupStatus === 'delivered'
      ? 'Delivered'
      : connection
        ? connection.isMain
          ? 'Primary'
          : connection.mainId
            ? 'Secondary'
            : 'Connecting'
        : undefined;
  const title = role ? `${role} | ${originalTitle}` : originalTitle;
  document.title = unreadCount > 0 ? `(${unreadCount}) ${title}` : title;
}

function render(): void {
  updateTitle();

  const isMain = connection?.isMain ?? false;
  const mainId = connection?.mainId;

  statusLabel.textContent =
    startupStatus === 'delivered'
      ? 'Message delivered'
      : isMain
        ? 'Main tab'
        : mainId
          ? 'Secondary tab'
          : 'Finding main tab';
  handoffNotice.hidden = isMain;
  inbox.hidden = !isMain;

  if (!connection) {
    tabCount.textContent = '0';
    tabList.replaceChildren();
    return;
  }

  const currentId = connection.id;
  const ids = [currentId, ...[...connection.peers.keys()].sort()];
  tabCount.textContent = String(ids.length);
  tabList.replaceChildren(
    ...ids.map((id) => createTabRow(id, id === currentId, id === mainId)),
  );
}

function createTabRow(
  id: string,
  isCurrentTab: boolean,
  isMain: boolean,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'tab';

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.textContent = '▣';

  const label = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `Tab ${id.slice(0, 6)}`;

  const detail = document.createElement('small');
  detail.textContent = isMain
    ? 'Main tab · receives data'
    : 'Secondary tab · sends data';
  label.append(title, detail);
  row.append(icon, label);

  if (isCurrentTab) {
    const badge = document.createElement('span');
    badge.className = 'you';
    badge.textContent = 'YOU';
    row.append(badge);
  }

  return row;
}

function receiveMessage(message: IncomingMessage): void {
  const item = document.createElement('article');
  item.className = 'received-message';

  const sender = document.createElement('strong');
  sender.textContent = `From tab ${message.senderId.slice(0, 6)}`;

  const content = document.createElement('p');
  content.textContent = message.value;
  item.append(sender, content);
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
  const key = keyInput.value.trim();

  if (!key) {
    return;
  }

  disconnect();
  startupStatus = undefined;
  errorMessage.hidden = true;
  messageList.replaceChildren();
  messageCount = 0;
  receivedCount.textContent = '0';
  emptyInbox.hidden = false;
  updatedLabel.textContent = 'Checking for an existing primary tab…';
  handoffNotice.textContent =
    'If a primary tab is already registered, this tab will send it a message and close after delivery is confirmed.';

  try {
    connection = new MainTabConnection(key);
    connection.addEventListener('change', render);
    connection.addEventListener('message', (event) => {
      receiveMessage((event as CustomEvent<IncomingMessage>).detail);
    });
    connection.addEventListener('error', () => {
      showError('Unable to register this tab. Reload to try again.');
    });

    const url = new URL(window.location.href);
    url.searchParams.set('key', key);
    window.history.replaceState(null, '', url);
    keyInput.value = key;
    render();
    disposeHandoff = handoffOnStartup(connection, {
      message: startupMessage,
      closeWindow: () => window.close(),
      onStatus: (status) => {
        startupStatus = status;

        switch (status) {
          case 'primary':
            updatedLabel.textContent = 'Registered as the primary tab';
            break;
          case 'sending':
            updatedLabel.textContent = 'Sending to the existing primary tab…';
            break;
          case 'delivered':
            disconnect();
            updatedLabel.textContent = 'Received by the primary tab';
            handoffNotice.textContent =
              'Your message was delivered. If this tab remains open, your browser prevented automatic closing. You can close it manually.';
            break;
          case 'unconfirmed':
            updatedLabel.textContent = 'Delivery not confirmed';
            handoffNotice.textContent =
              'Delivery could not be confirmed. This tab has been kept open. Check the primary tab and reload to try again.';
            break;
        }

        render();
      },
    });
  } catch {
    showError(
      'This app needs Web Locks and BroadcastChannel. Open it over HTTPS or localhost in a supported browser.',
    );
  }
}

keyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  connect();
});

openButton.addEventListener('click', () => {
  window.open(window.location.href, '_blank', 'noopener');
});

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
