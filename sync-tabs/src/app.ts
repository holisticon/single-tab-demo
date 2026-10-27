import { SessionSync } from './sync.js';

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
const valueInput = getElement('value', HTMLTextAreaElement);
const statusLabel = getElement('status', HTMLSpanElement);
const characterCount = getElement('characters', HTMLSpanElement);
const updatedLabel = getElement('updated', HTMLSpanElement);
const tabCount = getElement('count', HTMLSpanElement);
const tabList = getElement('tabs', HTMLDivElement);
const errorMessage = getElement('error', HTMLParagraphElement);
const clearButton = getElement('clear', HTMLButtonElement);
const openButton = getElement('open', HTMLButtonElement);

let sync: SessionSync | undefined;

const params = new URL(window.location.href).searchParams;
keyInput.value = params.get('key') || 'shared-note';

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  statusLabel.textContent = 'Unavailable';
}

function render(): void {
  const value = sync?.record?.value ?? '';

  if (valueInput.value !== value) {
    valueInput.value = value;
  }

  characterCount.textContent = `${value.length} character${value.length === 1 ? '' : 's'}`;
  updatedLabel.textContent = sync?.record
    ? 'Saved in this tab · synced live'
    : 'Ready when you are';
}

function createTabRow(id: string, isCurrentTab: boolean): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'tab';

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.textContent = '▣';

  const label = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `Tab ${id.slice(0, 6)}`;

  const detail = document.createElement('small');
  detail.textContent = isCurrentTab
    ? 'Active in this window'
    : 'Connected · receiving updates';

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

function renderTabs(): void {
  if (!sync) {
    return;
  }

  const currentId = sync.id;
  const peerIds = [...sync.peers.keys()].sort();
  const ids = [currentId, ...peerIds];

  tabCount.textContent = String(ids.length);
  tabList.replaceChildren(
    ...ids.map((id) => createTabRow(id, id === currentId)),
  );
}

function connect(): void {
  const key = keyInput.value.trim();

  if (!key) {
    return;
  }

  sync?.close();
  sync = undefined;
  errorMessage.hidden = true;

  try {
    sync = new SessionSync(key);
    sync.addEventListener('change', render);
    sync.addEventListener('presence', renderTabs);
    sync.addEventListener('storageerror', () => {
      showError(
        'Your browser could not save the incoming value. Check available storage and browser settings.',
      );
    });

    const url = new URL(window.location.href);
    url.searchParams.set('key', key);
    window.history.replaceState(null, '', url);

    keyInput.value = key;
    statusLabel.textContent = 'Live sync';
    valueInput.disabled = false;
    render();
    renderTabs();
  } catch {
    valueInput.disabled = true;
    showError(
      'This app needs sessionStorage and BroadcastChannel. Open it over HTTP in a browser that allows local storage.',
    );
  }
}

keyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  connect();
});

valueInput.addEventListener('input', () => {
  try {
    sync?.set(valueInput.value);
  } catch {
    showError(
      'Unable to save this value. Browser storage may be full or disabled.',
    );
  }
});

clearButton.addEventListener('click', () => {
  try {
    sync?.set('');
    valueInput.focus();
  } catch {
    showError(
      'Unable to clear the stored value. Browser storage may be disabled.',
    );
  }
});

openButton.addEventListener('click', () => {
  window.open(window.location.href, '_blank', 'noopener');
});

window.addEventListener('pagehide', () => {
  sync?.close();
  sync = undefined;
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    connect();
  }
});

connect();
