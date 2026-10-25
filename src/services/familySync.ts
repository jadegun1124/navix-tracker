import type { FamilyAlert } from './familyAlert';
import type { SharedPlace } from './familyShare';

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

let placeQueue: { place: SharedPlace; token: string } | null = null;
let alertQueue: { alert: FamilyAlert; token: string } | null = null;
let flushing = false;
let retryMs = 3000;

function hasPending() {
  return placeQueue != null || alertQueue != null;
}

export function publishPlaceRemote(place: SharedPlace, syncToken?: string | null) {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl()) return;
  placeQueue = {
    token: syncToken,
    place: {
      code: place.code,
      name: place.name.trim().slice(0, 80),
      lat: place.sharing ? place.lat : null,
      lng: place.sharing ? place.lng : null,
      accuracyM: place.accuracyM,
      at: place.at,
      sharing: place.sharing,
    },
  };
  void flushQueues();
}

export function publishAlertRemote(alert: FamilyAlert, syncToken?: string | null) {
  if (!syncToken || !splitSyncToken(syncToken) || !familySyncUrl()) return;
  alertQueue = { alert, token: syncToken };
  void flushQueues();
}

async function sendQueued(path: string, token: string, body: unknown, drop: () => void) {
  const response = await request(path, {
    method: path.endsWith('/alert') ? 'POST' : 'PUT',
    headers: { 'content-type': 'application/json', 'x-umap-sync-key': token },
    body: JSON.stringify(body),
  });
  classify(response);
  if (response.ok || response.status === 400 || response.status === 401 || response.status === 403) drop();
  return response.ok;
}

async function flushQueues() {
  if (flushing) return;
  flushing = true;
  let failed = false;
  try {
    const place = placeQueue;
    if (place) {
      const ok = await sendQueued(`/v1/rooms/${place.place.code}/place`, place.token, place.place, () => {
        if (placeQueue === place) placeQueue = null;
      });
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
  return typeof place.code === 'string' && place.code.length >= 4 && typeof place.name === 'string' && typeof place.at === 'number' && typeof place.sharing === 'boolean';
}

function isRemoteAlert(value: unknown): value is FamilyAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as FamilyAlert;
  return typeof alert.id === 'string' && (alert.kind === 'sos' || alert.kind === 'leave') && typeof alert.code === 'string' && typeof alert.at === 'number';
}

export function startAdminRemoteSync(
  link: RemoteLink | null,
  handlers: {
    onPlace: (place: SharedPlace) => void;
    onAlert: (alert: FamilyAlert) => void;
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
