export interface FamilyChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
  mine?: boolean;
}

const listeners = new Set<() => void>();

/** Keep identical to sync/protocol.mjs chatThreadKey. */
export function chatThreadKey(left: string, right: string): string {
  const a = left.trim().slice(0, 20);
  const b = right.trim().slice(0, 20);
  if (!a || !b || a === b) return '';
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function chatName(value: string | null | undefined): string {
  return (value || '').trim().slice(0, 20);
}

function storageKey(code: string, key: string) {
  return `umap_dm_v1:${code}:${encodeURIComponent(key)}`;
}

function seenKey(code: string, key: string) {
  return `umap_dm_seen:${code}:${encodeURIComponent(key)}`;
}

function notify() {
  for (const listener of listeners) listener();
}

export function isFamilyChatMessage(value: unknown): value is FamilyChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as FamilyChatMessage;
  return typeof message.id === 'string'
    && message.id.length >= 8
    && typeof message.from === 'string'
    && message.from.trim().length > 0
    && typeof message.to === 'string'
    && message.to.trim().length > 0
    && message.from.trim() !== message.to.trim()
    && typeof message.text === 'string'
    && message.text.trim().length > 0
    && typeof message.at === 'number'
    && Number.isFinite(message.at);
}

export function readDirectChat(code: string, me: string, peer: string): FamilyChatMessage[] {
  const key = chatThreadKey(me, peer);
  if (!code || !key) return [];
  try {
    const raw = localStorage.getItem(storageKey(code, key));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFamilyChatMessage).filter((message) => chatThreadKey(message.from, message.to) === key).slice(-40);
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

export function mergeDirectChat(code: string, me: string, peer: string, incoming: FamilyChatMessage[]) {
  const key = chatThreadKey(me, peer);
  if (!code || !key || incoming.length === 0) return;
  const mineName = chatName(me);
  const map = new Map(readDirectChat(code, me, peer).map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    if (!isFamilyChatMessage(message) || chatThreadKey(message.from, message.to) !== key) continue;
    const prev = map.get(message.id);
    const next = {
      id: message.id,
      from: chatName(message.from),
      to: chatName(message.to),
      text: message.text.trim().slice(0, 200),
      at: message.at,
      ...(prev?.mine || message.mine || chatName(message.from) === mineName ? { mine: true } : {}),
    };
    if (!prev || prev.text !== next.text || prev.mine !== next.mine) {
      map.set(message.id, next);
      changed = true;
    }
  }
  if (!changed) return;
  const next = [...map.values()].sort((left, right) => left.at - right.at).slice(-40);
  try {
    localStorage.setItem(storageKey(code, key), JSON.stringify(next));
  } catch {
    /* 대화 저장이 실패해도 화면의 이번 글은 유지한다 */
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

export function unreadCount(code: string, me: string, peer: string): number {
  const key = chatThreadKey(me, peer);
  if (!key) return 0;
  const seen = Number(localStorage.getItem(seenKey(code, key)) || 0);
  return readDirectChat(code, me, peer).filter((message) => !message.mine && message.at > seen).length;
}

export function markDirectChatRead(code: string, me: string, peer: string) {
  const key = chatThreadKey(me, peer);
  if (!key) return;
  const latest = readDirectChat(code, me, peer).reduce((max, message) => Math.max(max, message.at), 0);
  localStorage.setItem(seenKey(code, key), String(latest));
  notify();
}
