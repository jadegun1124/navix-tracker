import type { FamilyMessage } from '../types/family';
import { publishMessageRemote } from './familySync';

const CHANNEL = 'umap-family-chat';

export function chatSelfId(profile: { sub?: string; preview?: boolean } | null | undefined, deviceId: string): string {
  const sub = profile?.sub || 'member';
  if (profile?.preview && deviceId) return messageFromId(`${sub}.${deviceId}`);
  return messageFromId(sub);
}

export function messageFromId(sub: string): string {
  const clean = sub.replace(/[^\w.:@-]/g, '').slice(0, 80);
  return clean || 'member';
}

export function createFamilyMessage(input: { code: string; from: string; fromId: string; body: string }): FamilyMessage | null {
  const body = input.body.trim().slice(0, 500);
  const from = input.from.trim().slice(0, 80) || '가족';
  const fromId = messageFromId(input.fromId);
  const code = input.code.replace(/\D/g, '').slice(0, 6);
  if (!body || code.length < 4) return null;
  const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return { id, code, from, fromId, body, at: Date.now() };
}

export function deliverFamilyMessage(message: FamilyMessage, syncToken?: string | null) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    /* 이 웹뷰에는 BroadcastChannel 이 없습니다. */
  }
  publishMessageRemote(message, syncToken);
}

export function subscribeFamilyChat(onMessage: (message: FamilyMessage) => void): () => void {
  let channel: BroadcastChannel | null = null;
  const onEvent = (event: MessageEvent) => {
    const data = event.data as FamilyMessage;
    if (!data || typeof data.id !== 'string' || typeof data.body !== 'string' || typeof data.at !== 'number') return;
    onMessage(data);
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', onEvent);
  } catch {
    channel = null;
  }
  return () => {
    channel?.removeEventListener('message', onEvent);
    channel?.close();
  };
}
