import type { MessageBundle } from './protocol';

const inboxKey = 'openopticlink.inbox.v1';

export function loadInbox(): MessageBundle[] {
  const raw = localStorage.getItem(inboxKey);
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as MessageBundle[];
  if (!Array.isArray(parsed)) {
    throw new Error('Stored inbox is not valid.');
  }
  return parsed;
}

export function saveToInbox(bundle: MessageBundle): MessageBundle[] {
  const existing = loadInbox().filter((item) => item.id !== bundle.id);
  const next = [bundle, ...existing].slice(0, 50);
  localStorage.setItem(inboxKey, JSON.stringify(next));
  return next;
}

export function clearInbox(): void {
  localStorage.removeItem(inboxKey);
}
