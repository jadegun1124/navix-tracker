import { rememberPlaceName } from '../lib/placeAlias.mjs';
import type { FamilyAlert } from './familyAlert';
import { isFamilyChatMessage, type FamilyChatMessage } from './familyChat';
import type { SharedPlace, SharedProfile } from './familyShare';

// Keep the hash identical to sync/protocol.mjs.
// sha256Base64Url('umap-read-key') === 'BL04F54qEIA94kVM3un2L2ITH4kcV-H8m2JJNnuuHVQ'

const KEY_PART = /^[A-Za-z0-9_-]{16,64}$/;

export type SyncPhase = 'off' | 'connecting' | 'live' | 'down' | 'rejected';

export function isKeyPart(value: unknown): value is string {
  return typeof value === 'string' && KEY_PART.test(value);
}

export function splitSyncToken(token: string | null | undefined): { writeKey: string; readKeyHash: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !isKeyPart(parts[0]) || !isKeyPart(parts[1])) return null;
  return { writeKey: parts[0], readKeyHash: parts[1] };
}

export function createKeyPart(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

const hashCache = new Map<string, Promise<string>>();

export function syncTokenFor(writeKey: string, readKey: string): Promise<string> {
  let pending = hashCache.get(readKey);
  if (!pending) {
    pending = sha256Base64Url(readKey);
    hashCache.set(readKey, pending);
  }
  return pending.then((hash) => `${writeKey}.${hash}`);
}

export function familySyncUrl(): string | null {
  const raw = (import.meta.env.VITE_FAMILY_SYNC_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin;
  } catch {
    /* 잘못된 주소는 없는 것과 같이 봅니다. */
  }
  return null;
}

export function familySyncConfigured(): boolean {
  return familySyncUrl() != null;
}

type Listener = (phase: SyncPhase) => void;
const listeners = new Set<Listener>();
let phase: SyncPhase = familySyncConfigured() ? 'connecting' : 'off';

function setPhase(next: SyncPhase) {
  if (phase === next) return;
  phase = next;
  for (const listener of listeners) listener(phase);
}

export function currentSyncPhase(): SyncPhase {
  return phase;
}

export function subscribeSyncPhase(listener: Listener): () => void {
  listeners.add(listener);
  listener(phase);
  return () => {
    listeners.delete(listener);
  };
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const base = familySyncUrl();
  if (!base) throw new Error('off');
  return fetch(`${base}${path}`, { ...init, signal: timeoutSignal(8000), cache: 'no-store' });
}

function classify(response: Response) {
  if (response.ok) setPhase('live');
  else if (response.status === 401 || response.status === 403) setPhase('rejected');
  else setPhase('down');
}

let placeQueue: { code: string; token: string; body: Record<string, unknown>; profileKey: string } | null = null;
let profileQueue: { code: string; token: string; body: Record<string, unknown>; profileKey: string } | null = null;
let alertQueue: { alert: FamilyAlert; token: string } | null = null;
let flushing = false;
let retryMs = 3000;

const MAX_PROFILE_PHOTO = 24_000;

function hasPending() {
  return placeQueue != null || alertQueue != null || profileQueue != null;
}

export function publishPlaceRemote(place: SharedPlace, syncToken?: string | null, profileKey?: string | null): boolean {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl()) return false;
  const name = place.name.trim().slice(0, 80);
  const body: Record<string, unknown> = {
    code: place.code,
    name,
    lat: place.sharing ? place.lat : null,
    lng: place.sharing ? place.lng : null,
    accuracyM: place.accuracyM,
    at: place.at,
    sharing: place.sharing,
  };
  if (place.sharing && typeof place.batteryPct === 'number' && place.batteryPct >= 0 && place.batteryPct <= 100) {
    body.batteryPct = Math.round(place.batteryPct);
  }
  if (place.sharing && typeof place.charging === 'boolean') body.charging = place.charging;
  if (place.audience === 'family') body.audience = 'family';
  const memberId = typeof place.memberId === 'string' && /^local-[a-z0-9]{3,64}$/.test(place.memberId) ? place.memberId : '';
  const key = typeof profileKey === 'string' ? profileKey : '';
  if (memberId && key) body.memberId = memberId;
  const priorName = typeof place.priorName === 'string' ? place.priorName.trim().slice(0, 80) : '';
  if (priorName && priorName !== name) body.priorName = priorName;
  placeQueue = { code: place.code, token: syncToken, body, profileKey: memberId ? key : '' };
  void flushQueues();
  return true;
}

export function publishProfileRemote(
  profile: { memberId: string; name: string; photo?: string | null; at: number },
  code: string,
  syncToken?: string | null,
  profileKey?: string | null,
): boolean {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl() || !/^\d{4,6}$/.test(code)) return false;
  if (!/^local-[a-z0-9]{3,64}$/.test(profile.memberId) || !profileKey) return false;
  const name = profile.name.trim().slice(0, 20);
  if (!name) return false;
  const body: Record<string, unknown> = { memberId: profile.memberId, name, at: profile.at };
  if (!profile.photo) body.photo = null;
  else if (profile.photo.startsWith('data:image/') && profile.photo.length <= MAX_PROFILE_PHOTO) body.photo = profile.photo;
  profileQueue = { code, token: syncToken, body, profileKey };
  void flushQueues();
  return true;
}

export async function publishChatRemote(
  code: string,
  syncToken: string | null | undefined,
  message: FamilyChatMessage,
): Promise<'ok' | 'local'> {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl() || !/^\d{4,6}$/.test(code)) return 'local';
  try {
    const response = await request(`/v1/rooms/${code}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-umap-sync-key': syncToken },
      body: JSON.stringify({ id: message.id, from: message.from, to: message.to, text: message.text, at: message.at }),
    });
    classify(response);
    if (response.ok) return 'ok';
    return 'local';
  } catch {
    if (familySyncUrl()) setPhase('down');
    return 'local';
  }
}

export async function fetchDirectChat(
  code: string,
  syncToken: string | null | undefined,
  me: string,
  peer: string,
): Promise<FamilyChatMessage[] | null> {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl() || !/^\d{4,6}$/.test(code) || !me.trim() || !peer.trim()) return null;
  const query = new URLSearchParams({ me: me.trim().slice(0, 20), with: peer.trim().slice(0, 20) });
  try {
    const response = await request(`/v1/rooms/${code}/chat?${query}`, {
      method: 'GET',
      headers: { 'x-umap-sync-key': syncToken },
    });
    if (response.status === 404) return null;
    classify(response);
    if (!response.ok) return null;
    return readChatMessages(await response.json());
  } catch {
    return null;
  }
}

export async function fetchMyDirectThreads(
  code: string,
  syncToken: string | null | undefined,
  me: string,
): Promise<{ peer: string; messages: FamilyChatMessage[] }[] | null> {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl() || !/^\d{4,6}$/.test(code) || !me.trim()) return null;
  const query = new URLSearchParams({ me: me.trim().slice(0, 20) });
  try {
    const response = await request(`/v1/rooms/${code}/chat?${query}`, {
      method: 'GET',
      headers: { 'x-umap-sync-key': syncToken },
    });
    if (response.status === 404) return null;
    classify(response);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !Array.isArray((body as { threads?: unknown }).threads)) return [];
    const threads: { peer: string; messages: FamilyChatMessage[] }[] = [];
    for (const item of (body as { threads: unknown[] }).threads) {
      if (!item || typeof item !== 'object') continue;
      const peer = typeof (item as { peer?: unknown }).peer === 'string' ? (item as { peer: string }).peer : '';
      const messages = readChatMessages(item);
      if (peer && messages.length) threads.push({ peer, messages });
    }
    return threads;
  } catch {
    return null;
  }
}

function readChatMessages(body: unknown): FamilyChatMessage[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { messages?: unknown }).messages)) return [];
  return (body as { messages: unknown[] }).messages.filter(isFamilyChatMessage);
}

export function publishAlertRemote(alert: FamilyAlert, syncToken?: string | null) {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl()) return;
  alertQueue = { alert, token: syncToken };
  void flushQueues();
}

async function sendQueued(path: string, token: string, body: unknown, drop: () => void, profileKey = '') {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-umap-sync-key': token };
  if (profileKey) headers['x-umap-profile-key'] = profileKey;
  const response = await request(path, {
    method: path.endsWith('/alert') ? 'POST' : 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const staleProfile = path.endsWith('/profile') && response.status === 404;
  if (!staleProfile) classify(response);
  if (response.ok || staleProfile || response.status === 400 || response.status === 401 || response.status === 403 || response.status === 413) drop();
  return response.ok || staleProfile;
}

async function flushQueues() {
  if (flushing) return;
  flushing = true;
  let failed = false;
  try {
    const place = placeQueue;
    if (place) {
      const ok = await sendQueued(`/v1/rooms/${place.code}/place`, place.token, place.body, () => {
        if (placeQueue === place) placeQueue = null;
      }, place.profileKey);
      if (ok) {
        const sentName = typeof place.body.name === 'string' ? place.body.name : '';
        const sentAudience = place.body.audience === 'family' ? 'family' : 'admin';
        if (sentName) rememberPlaceName(place.code, sentAudience, sentName);
      }
      if (!ok) failed = true;
    }
    const profile = profileQueue;
    if (profile) {
      const ok = await sendQueued(`/v1/rooms/${profile.code}/profile`, profile.token, profile.body, () => {
        if (profileQueue === profile) profileQueue = null;
      }, profile.profileKey);
      if (!ok) failed = true;
    }
    const alert = alertQueue;
    if (alert) {
      const ok = await sendQueued(`/v1/rooms/${alert.alert.code}/alert`, alert.token, alert.alert, () => {
        if (alertQueue === alert) alertQueue = null;
      });
      if (!ok) failed = true;
    }
    retryMs = failed ? Math.min(retryMs * 2, 20000) : 3000;
  } catch {
    failed = true;
    retryMs = Math.min(retryMs * 2, 20000);
    if (familySyncUrl()) setPhase('down');
    else setPhase('off');
  } finally {
    flushing = false;
    if (hasPending()) window.setTimeout(() => void flushQueues(), retryMs);
  }
}

export async function probeFamilySync() {
  if (!familySyncUrl()) {
    setPhase('off');
    return;
  }
  try {
    const response = await request('/health', { method: 'GET' });
    const body: unknown = await response.json().catch(() => null);
    const healthy = response.ok && !!body && typeof body === 'object' && (body as { ok?: boolean; service?: string }).ok === true && (body as { service?: string }).service === 'umap-family-sync';
    if (!healthy) {
      setPhase('down');
      return;
    }
    await flushQueues();
    if (phase !== 'rejected' && !hasPending()) setPhase('live');
  } catch {
    setPhase('down');
  }
}

export function startSyncMonitor(): () => void {
  if (!familySyncUrl()) {
    setPhase('off');
    return () => {};
  }
  void probeFamilySync();
  const timer = window.setInterval(() => void probeFamilySync(), 20000);
  return () => window.clearInterval(timer);
}

export interface RemoteLink {
  code: string;
  writeKey: string;
  readKey: string;
}

function isSharedPlace(value: unknown): value is SharedPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as SharedPlace;
  if (place.audience != null && place.audience !== 'admin' && place.audience !== 'family') return false;
  return typeof place.code === 'string' && place.code.length >= 4 && typeof place.name === 'string' && typeof place.at === 'number' && typeof place.sharing === 'boolean';
}

function isRemoteAlert(value: unknown): value is FamilyAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as FamilyAlert;
  return typeof alert.id === 'string' && (alert.kind === 'sos' || alert.kind === 'leave') && typeof alert.code === 'string' && typeof alert.at === 'number';
}

function isSharedProfile(value: unknown): value is SharedProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as SharedProfile;
  if (typeof profile.memberId !== 'string' || !/^local-[a-z0-9]{3,64}$/.test(profile.memberId)) return false;
  if (typeof profile.name !== 'string' || !profile.name.trim()) return false;
  if (typeof profile.at !== 'number' || !Number.isFinite(profile.at)) return false;
  if (profile.photo != null && (typeof profile.photo !== 'string' || !profile.photo.startsWith('data:image/') || profile.photo.length > 120_000)) return false;
  return true;
}

function readProfiles(body: unknown): SharedProfile[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { profiles?: unknown }).profiles)) return [];
  return (body as { profiles: unknown[] }).profiles.filter(isSharedProfile).map((profile) => ({
    memberId: profile.memberId,
    name: profile.name.trim().slice(0, 20),
    photo: typeof profile.photo === 'string' ? profile.photo : null,
    at: profile.at,
  }));
}

export function startAdminRemoteSync(
  link: RemoteLink | null,
  handlers: {
    onPlace: (place: SharedPlace) => void;
    onAlert: (alert: FamilyAlert) => void;
    onProfiles?: (profiles: SharedProfile[]) => void;
  },
): () => void {
  if (!link || !familySyncUrl() || !isKeyPart(link.writeKey) || !isKeyPart(link.readKey) || !/^\d{4,6}$/.test(link.code)) return () => {};
  let stopped = false;
  let since = 0;
  let timer = 0;

  const schedule = (delay: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void tick(), delay);
  };

  const tick = async () => {
    if (stopped) return;
    let delay = 2500;
    try {
      const token = await syncTokenFor(link.writeKey, link.readKey);
      // `since` filters alerts only. Places are always the latest consented points,
      // so a cursor from yesterday cannot skip a managed member's new fix.
      const response = await request(`/v1/rooms/${link.code}?since=${since}`, {
        method: 'GET',
        headers: {
          'x-umap-sync-key': token,
          'x-umap-read-key': link.readKey,
        },
      });
      classify(response);
      if (response.ok) {
        const body: unknown = await response.json();
        const places = body && typeof body === 'object' && Array.isArray((body as { places?: unknown[] }).places) ? (body as { places: unknown[] }).places : [];
        const alerts = body && typeof body === 'object' && Array.isArray((body as { alerts?: unknown[] }).alerts) ? (body as { alerts: unknown[] }).alerts : [];
        for (const place of places) {
          if (isSharedPlace(place)) handlers.onPlace(place);
        }
        handlers.onProfiles?.(readProfiles(body));
        for (const alert of alerts) {
          if (!isRemoteAlert(alert)) continue;
          handlers.onAlert(alert);
          if (alert.at > since) since = alert.at;
        }
      } else {
        delay = 8000;
      }
    } catch {
      if (!stopped) setPhase('down');
      delay = 8000;
    }
    if (stopped) return;
    if (document.visibilityState === 'hidden') delay = Math.max(delay, 12000);
    schedule(delay);
  };

  void tick();
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    window.clearTimeout(timer);
    void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

const familyEndpointReady = new Map<string, boolean>();

/** True only when this worker serves GET /family. A 404 is the previous worker, which stores places by name and would let an admin self-share overwrite a child. */
export async function familyEndpointAvailable(code: string, token: string): Promise<boolean> {
  const cached = familyEndpointReady.get(code);
  if (cached != null) return cached;
  if (!familySyncUrl() || !splitSyncToken(token) || !/^\d{4,6}$/.test(code)) return false;
  try {
    const response = await request(`/v1/rooms/${code}/family`, {
      method: 'GET',
      headers: { 'x-umap-sync-key': token },
    });
    if (response.status === 404) {
      familyEndpointReady.set(code, false);
      return false;
    }
    if (response.ok) {
      familyEndpointReady.set(code, true);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function startManagedFamilySync(
  links: { code: string; token: string }[],
  onRoom: (code: string, places: SharedPlace[], profiles: SharedProfile[]) => void,
): () => void {
  const usable = links.filter((link) => splitSyncToken(link.token) && /^\d{4,6}$/.test(link.code));
  if (!familySyncUrl() || usable.length === 0) return () => {};
  let stopped = false;
  let timer = 0;

  const tick = async () => {
    if (stopped) return;
    let delay = 4000;
    try {
      for (const link of usable) {
        if (stopped) return;
        const response = await request(`/v1/rooms/${link.code}/family`, {
          method: 'GET',
          headers: { 'x-umap-sync-key': link.token },
        });
        if (response.status === 404) continue;
        classify(response);
        if (!response.ok) {
          delay = 12000;
          continue;
        }
        const body: unknown = await response.json();
        const raw = body && typeof body === 'object' && Array.isArray((body as { places?: unknown[] }).places) ? (body as { places: unknown[] }).places : [];
        const places = raw.filter((place): place is SharedPlace => isSharedPlace(place) && place.audience === 'family' && place.sharing);
        onRoom(link.code, places, readProfiles(body));
      }
    } catch {
      if (!stopped && familySyncUrl()) setPhase('down');
      delay = 12000;
    }
    if (stopped) return;
    if (document.visibilityState === 'hidden') delay = Math.max(delay, 20000);
    timer = window.setTimeout(() => void tick(), delay);
  };

  void tick();
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    window.clearTimeout(timer);
    void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const text = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Subscribe this admin browser for Worker-sent Web Push. Returns false when the WebView has no Push API. */
export async function registerAdminPush(link: RemoteLink): Promise<boolean> {
  if (!familySyncUrl() || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await request('/v1/push/vapid', { method: 'GET' });
    if (!keyResponse.ok) return false;
    const keyBody: unknown = await keyResponse.json();
    const publicKey = keyBody && typeof keyBody === 'object' ? (keyBody as { publicKey?: unknown }).publicKey : null;
    if (typeof publicKey !== 'string' || publicKey.length < 16) return false;
    const existing = await registration.pushManager.getSubscription();
    const applicationServerKey = base64UrlToBytes(publicKey);
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) return false;
    const token = await syncTokenFor(link.writeKey, link.readKey);
    const response = await request(`/v1/rooms/${link.code}/push`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-umap-sync-key': token,
        'x-umap-read-key': link.readKey,
      },
      body: JSON.stringify({ endpoint, p256dh, auth }),
    });
    classify(response);
    return response.ok;
  } catch {
    return false;
  }
}
