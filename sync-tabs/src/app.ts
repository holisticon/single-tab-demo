import { MainTabConnection, type IncomingMessage } from './main-tab.js';

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
const composer = getElement('composer', HTMLDivElement);
const valueInput = getElement('value', HTMLTextAreaElement);
const sendButton = getElement('send', HTMLButtonElement);
const statusLabel = getElement('status', HTMLSpanElement);
const characterCount = getElement('characters', HTMLSpanElement);
const updatedLabel = getElement('updated', HTMLSpanElement);
const tabCount = getElement('count', HTMLSpanElement);
const tabList = getElement('tabs', HTMLDivElement);
const errorMessage = getElement('error', HTMLParagraphElement);
const clearButton = getElement('clear', HTMLButtonElement);
const openButton = getElement('open', HTMLButtonElement);
const inbox = getElement('inbox', HTMLElement);
const messageList = getElement('messages', HTMLDivElement);
const emptyInbox = getElement('empty-inbox', HTMLParagraphElement);
const receivedCount = getElement('received-count', HTMLSpanElement);

let connection: MainTabConnection | undefined;
let pendingMessageId: string | undefined;
let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
let messageCount = 0;

const params = new URL(window.location.href).searchParams;
keyInput.value = params.get('key') || 'main-tab-demo';

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  statusLabel.textContent = 'Unavailable';
}

function render(): void {
  const isMain = connection?.isMain ?? false;
  const mainId = connection?.mainId;

  statusLabel.textContent = isMain
    ? 'Main tab'
    : mainId
      ? 'Secondary tab'
      : 'Finding main tab';
  composer.hidden = isMain;
  inbox.hidden = !isMain;
  sendButton.disabled =
    !connection || isMain || !mainId || !valueInput.value.trim();
  characterCount.textContent = `${valueInput.value.length} characters`;

  if (!connection) {
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
}

function disconnect(): void {
  clearTimeout(deliveryTimer);
  pendingMessageId = undefined;
  connection?.close();
  connection = undefined;
}

function connect(): void {
  const key = keyInput.value.trim();

  if (!key) {
    return;
  }

  disconnect();
  errorMessage.hidden = true;
  messageList.replaceChildren();
  messageCount = 0;
  receivedCount.textContent = '0';
  emptyInbox.hidden = false;
  updatedLabel.textContent = 'Ready when you are';

  try {
    connection = new MainTabConnection(key);
    connection.addEventListener('change', render);
    connection.addEventListener('message', (event) => {
      receiveMessage((event as CustomEvent<IncomingMessage>).detail);
    });
    connection.addEventListener('delivered', (event) => {
      if ((event as CustomEvent<string>).detail === pendingMessageId) {
        clearTimeout(deliveryTimer);
        pendingMessageId = undefined;
        updatedLabel.textContent = 'Received by the main tab';
      }
    });
    connection.addEventListener('error', () => {
      showError('Unable to register this tab. Reload to try again.');
      sendButton.disabled = true;
    });

    const url = new URL(window.location.href);
    url.searchParams.set('key', key);
    window.history.replaceState(null, '', url);
    keyInput.value = key;
    render();
  } catch {
    showError(
      'This app needs Web Locks and BroadcastChannel. Open it over HTTPS or localhost in a supported browser.',
    );
    sendButton.disabled = true;
  }
}

keyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  connect();
});

valueInput.addEventListener('input', render);

sendButton.addEventListener('click', () => {
  if (!connection || !valueInput.value.trim()) {
    return;
  }

  try {
    pendingMessageId = connection.send(valueInput.value);
    updatedLabel.textContent = 'Waiting for the main tab to confirm…';
    clearTimeout(deliveryTimer);
    deliveryTimer = setTimeout(() => {
      pendingMessageId = undefined;
      updatedLabel.textContent = 'Receipt not confirmed. You can send again.';
    }, 5_000);
  } catch {
    updatedLabel.textContent =
      'Main tab unavailable. Wait for a main tab and send again.';
  }
});

clearButton.addEventListener('click', () => {
  valueInput.value = '';
  valueInput.focus();
  render();
});

openButton.addEventListener('click', () => {
  window.open(window.location.href, '_blank', 'noopener');
});

window.addEventListener('pagehide', disconnect);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    connect();
  }
});

connect();
