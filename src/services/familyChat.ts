export interface FamilyChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
  mine?: boolean;
}

const listeners = new Set<() => void>();

function storageKey(code: string) {
  return `umap_chat_v1:${code}`;
}

function seenKey(code: string) {
  return `umap_chat_seen:${code}`;
}

function notify() {
  for (const listener of listeners) listener();
}

export function isFamilyChatMessage(value: unknown): value is FamilyChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as FamilyChatMessage;
  return typeof message.id === 'string'
    && message.id.length >= 8
    && typeof message.name === 'string'
    && message.name.trim().length > 0
    && typeof message.text === 'string'
    && message.text.trim().length > 0
    && typeof message.at === 'number'
    && Number.isFinite(message.at);
}

export function readChat(code: string): FamilyChatMessage[] {
  if (!code) return [];
  try {
    const raw = localStorage.getItem(storageKey(code));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFamilyChatMessage).slice(-40);
  } catch {
    return [];
  }
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mergeChat(code: string, incoming: FamilyChatMessage[]) {
  if (!code || incoming.length === 0) return;
  const map = new Map(readChat(code).map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    if (!isFamilyChatMessage(message)) continue;
    const prev = map.get(message.id);
    const next = {
      id: message.id,
      name: message.name.trim().slice(0, 20),
      text: message.text.trim().slice(0, 200),
      at: message.at,
      ...(prev?.mine || message.mine ? { mine: true } : {}),
    };
    if (!prev || prev.text !== next.text || prev.name !== next.name || prev.mine !== next.mine) {
      map.set(message.id, next);
      changed = true;
    }
  }
  if (!changed) return;
  const next = [...map.values()].sort((left, right) => left.at - right.at).slice(-40);
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(next));
  } catch {
    /* 채팅 저장이 실패해도 화면의 이번 글은 유지한다 */
  }
  notify();
}

export function createChatId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function unreadCount(code: string): number {
  const seen = Number(localStorage.getItem(seenKey(code)) || 0);
  return readChat(code).filter((message) => !message.mine && message.at > seen).length;
}

export function markChatRead(code: string) {
  const latest = readChat(code).reduce((max, message) => Math.max(max, message.at), 0);
  localStorage.setItem(seenKey(code), String(latest));
  notify();
}
