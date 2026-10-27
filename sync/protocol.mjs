// Family location room. The latest point per consented name, plus recent alerts.
// Phone numbers are not accepted. The read key is never stored.
// Admin push subscriptions stay in the room and are never returned to readers.

import { base64UrlToBytes, pushEndpointAllowed } from './webpush.mjs';

const KEY_PART = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_PART = /^\d{4,6}$/;
const ALERT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_BODY = 4096;
const MAX_PLACES = 20;
const MAX_ALERTS = 30;
const ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_AT = Date.UTC(2024, 0, 1);

export function emptyRoom() {
  return { places: {}, alerts: [], pushes: [] };
}

export function isKeyPart(value) {
  return typeof value === 'string' && KEY_PART.test(value);
}

export function splitSyncToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !isKeyPart(parts[0]) || !isKeyPart(parts[1])) return null;
  return { writeKey: parts[0], readKeyHash: parts[1] };
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function roomToken(code, writeKey, readKeyHash) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${code}\0${writeKey}\0${readKeyHash}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, PUT, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-umap-sync-key, x-umap-read-key');
  headers.set('access-control-max-age', '86400');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) return { error: json({ error: 'size' }, 413) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: json({ error: 'size' }, 413) };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: json({ error: 'json' }, 400) };
  }
}

function cleanStamp(at, now) {
  return typeof at === 'number' && Number.isFinite(at) && at >= EARLIEST_AT && at <= now + FUTURE_SKEW_MS;
}

function cleanAudience(input) {
  if (input.audience == null) return 'admin';
  if (input.audience === 'admin' || input.audience === 'family') return input.audience;
  return null;
}

function cleanBattery(input, sharing) {
  if (!sharing) return { batteryPct: null, charging: null };
  let batteryPct = null;
  if (input.batteryPct != null) {
    const value = Number(input.batteryPct);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    batteryPct = Math.round(value);
  }
  let charging = null;
  if (input.charging != null) {
    if (typeof input.charging !== 'boolean') return null;
    charging = input.charging;
  }
  return { batteryPct, charging };
}

function cleanPlace(input, code, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: json({ error: 'place' }, 400) };
  if (input.code !== code || !CODE_PART.test(code)) return { error: json({ error: 'code' }, 400) };
  if (typeof input.name !== 'string') return { error: json({ error: 'name' }, 400) };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: json({ error: 'name' }, 400) };
  if (typeof input.sharing !== 'boolean') return { error: json({ error: 'sharing' }, 400) };
  if (!cleanStamp(input.at, now)) return { error: json({ error: 'at' }, 400) };
  const audience = cleanAudience(input);
  if (!audience) return { error: json({ error: 'audience' }, 400) };
  const battery = cleanBattery(input, input.sharing);
  if (!battery) return { error: json({ error: 'battery' }, 400) };

  let lat = input.lat;
  let lng = input.lng;
  if (!input.sharing || lat == null || lng == null) {
    if (input.sharing && (lat != null || lng != null)) return { error: json({ error: 'coords' }, 400) };
    lat = null;
    lng = null;
  } else if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { error: json({ error: 'coords' }, 400) };
  }

  let accuracyM = Number(input.accuracyM);
  if (!Number.isFinite(accuracyM) || accuracyM < 0) accuracyM = 0;
  accuracyM = Math.min(100_000, Math.round(accuracyM));

  return {
    place: {
      code,
      name,
      lat,
      lng,
      accuracyM,
      at: input.at,
      sharing: input.sharing,
      audience,
      batteryPct: battery.batteryPct,
      charging: battery.charging,
    },
  };
}

function cleanAlert(input, code, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: json({ error: 'alert' }, 400) };
  if (typeof input.id !== 'string' || !ALERT_ID.test(input.id)) return { error: json({ error: 'alert' }, 400) };
  if (input.kind !== 'sos' && input.kind !== 'leave') return { error: json({ error: 'alert' }, 400) };
  if (input.code !== code) return { error: json({ error: 'code' }, 400) };
  if (typeof input.from !== 'string' || typeof input.body !== 'string') return { error: json({ error: 'alert' }, 400) };
  const from = input.from.trim().slice(0, 80);
  const body = input.body.trim().slice(0, 200);
  if (!from || !body) return { error: json({ error: 'alert' }, 400) };
  if (!cleanStamp(input.at, now)) return { error: json({ error: 'at' }, 400) };
  return { alert: { id: input.id, kind: input.kind, code, from, body, at: input.at } };
}

function placeStorageKey(place) {
  return place.audience === 'family' ? `family\u0000${place.name}` : place.name;
}

function samePlaceSnapshot(current, place) {
  return current.sharing === place.sharing
    && current.lat === place.lat
    && current.lng === place.lng
    && current.accuracyM === place.accuracyM
    && (current.batteryPct ?? null) === (place.batteryPct ?? null)
    && (current.charging ?? null) === (place.charging ?? null)
    && (current.audience === 'family' ? 'family' : 'admin') === (place.audience === 'family' ? 'family' : 'admin');
}

function hasFix(place) {
  return !!place && place.sharing === true && place.lat != null && place.lng != null;
}

function isPlaceholder(place) {
  return !!place && place.sharing === true && place.lat == null && place.lng == null;
}

export function applyPlace(room, place) {
  const key = placeStorageKey(place);
  const current = room.places[key];
  const incomingFix = hasFix(place);
  const currentFix = hasFix(current);
  // A heartbeat with no coordinates must not erase a live fix or move its cursor forward.
  if (place.sharing && !incomingFix && currentFix) return { room, ignored: true };
  // A sharing heartbeat with no fix can be newer than the first real fix. The fix still wins.
  // A newer stop (sharing false) is not a placeholder, so an older fix cannot undo it.
  if (current && place.at < current.at && !(incomingFix && isPlaceholder(current))) return { room, ignored: true };
  let next = place;
  if (place.sharing && next.batteryPct == null && current && typeof current.batteryPct === 'number') {
    next = {
      ...next,
      batteryPct: current.batteryPct,
      charging: next.charging == null ? (current.charging ?? null) : next.charging,
    };
  }
  if (current && next.at === current.at && samePlaceSnapshot(current, next)) return { room, ignored: true };
  const places = { ...room.places, [key]: next };
  const names = Object.keys(places);
  if (names.length > MAX_PLACES) {
    names.sort((left, right) => places[left].at - places[right].at);
    while (names.length > MAX_PLACES) {
      const oldest = names.shift();
      if (oldest) delete places[oldest];
    }
  }
  return { room: { ...room, places }, ignored: false };
}

export function applyAlert(room, alert, now) {
  if (room.alerts.some((item) => item.id === alert.id)) return { room, ignored: true };
  const alerts = [...room.alerts, alert].filter((item) => now - item.at < ALERT_TTL_MS).slice(-MAX_ALERTS);
  return { room: { ...room, alerts }, ignored: false };
}

function roomPushes(room) {
  return Array.isArray(room.pushes) ? room.pushes : [];
}

export function applySubscription(room, subscription) {
  const pushes = roomPushes(room).filter((item) => item.endpoint !== subscription.endpoint);
  pushes.push(subscription);
  while (pushes.length > 8) pushes.shift();
  return { ...room, pushes };
}

export function removeSubscriptions(room, endpoints) {
  const gone = new Set(endpoints);
  return { ...room, pushes: roomPushes(room).filter((item) => !gone.has(item.endpoint)) };
}

export function viewRoom(room, since) {
  const cursor = Number.isFinite(since) ? since : 0;
  return {
    places: Object.values(room.places),
    alerts: room.alerts.filter((alert) => alert.at > cursor),
  };
}

function cleanSubscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: json({ error: 'push' }, 400) };
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 500 || !pushEndpointAllowed(input.endpoint)) {
    return { error: json({ error: 'push' }, 400) };
  }
  if (typeof input.p256dh !== 'string' || typeof input.auth !== 'string') return { error: json({ error: 'push' }, 400) };
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(input.p256dh) || !/^[A-Za-z0-9_-]{16,200}$/.test(input.auth)) {
    return { error: json({ error: 'push' }, 400) };
  }
  let publicKey;
  let auth;
  try {
    publicKey = base64UrlToBytes(input.p256dh);
    auth = base64UrlToBytes(input.auth);
  } catch {
    return { error: json({ error: 'push' }, 400) };
  }
  if (publicKey.length !== 65 || publicKey[0] !== 4 || auth.length < 16 || auth.length > 32) {
    return { error: json({ error: 'push' }, 400) };
  }
  return { subscription: { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth } };
}

export function viewFamilyPlaces(room) {
  return {
    places: Object.values(room.places).filter((place) => place.audience === 'family' && place.sharing && place.lat != null && place.lng != null),
  };
}

export async function parseOperation(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/health/')) {
    return { kind: 'health' };
  }

  if (request.method === 'GET' && (url.pathname === '/v1/push/vapid' || url.pathname === '/v1/push/vapid/')) {
    return { kind: 'vapid-public' };
  }

  const match = url.pathname.match(/^\/v1\/rooms\/(\d{4,6})(\/place|\/alert|\/family|\/push)?\/?$/);
  if (!match) return json({ error: 'not-found' }, 404);
  const code = match[1];
  const action = match[2] || '';
  const token = splitSyncToken(request.headers.get('x-umap-sync-key') || '');
  if (!token) return json({ error: 'sync-key' }, 401);
  const id = await roomToken(code, token.writeKey, token.readKeyHash);

  if (request.method === 'GET' && action === '/family') {
    return { kind: 'family', token: id };
  }

  if (request.method === 'GET' && action === '') {
    const readKey = request.headers.get('x-umap-read-key') || '';
    if (!isKeyPart(readKey)) return json({ error: 'read-key' }, 403);
    const actual = await sha256Base64Url(readKey);
    if (!safeEqual(actual, token.readKeyHash)) return json({ error: 'read-key' }, 403);
    const since = Number(url.searchParams.get('since') || 0);
    return { kind: 'get', token: id, since: Number.isFinite(since) ? since : 0 };
  }

  if (request.method === 'PUT' && action === '/place') {
    const body = await readJson(request);
    if (body.error) return body.error;
    const cleaned = cleanPlace(body.value, code, Date.now());
    if (cleaned.error) return cleaned.error;
    return { kind: 'place', token: id, place: cleaned.place };
  }

  if ((request.method === 'PUT' || request.method === 'DELETE') && action === '/push') {
    const readKey = request.headers.get('x-umap-read-key') || '';
    if (!isKeyPart(readKey)) return json({ error: 'read-key' }, 403);
    const actual = await sha256Base64Url(readKey);
    if (!safeEqual(actual, token.readKeyHash)) return json({ error: 'read-key' }, 403);
    const body = await readJson(request);
    if (body.error) return body.error;
    if (request.method === 'DELETE') {
      const endpoint = body.value && typeof body.value.endpoint === 'string' ? body.value.endpoint : '';
      if (!pushEndpointAllowed(endpoint)) return json({ error: 'push' }, 400);
      return { kind: 'push-remove', token: id, endpoints: [endpoint] };
    }
    const cleaned = cleanSubscription(body.value);
    if (cleaned.error) return cleaned.error;
    return { kind: 'push-subscribe', token: id, subscription: cleaned.subscription };
  }

  if (request.method === 'POST' && action === '/alert') {
    const body = await readJson(request);
    if (body.error) return body.error;
    const cleaned = cleanAlert(body.value, code, Date.now());
    if (cleaned.error) return cleaned.error;
    return { kind: 'alert', token: id, alert: cleaned.alert };
  }

  return json({ error: 'method' }, 405);
}

export function alertPushPayload(alert) {
  return {
    id: alert.id,
    kind: alert.kind,
    title: alert.kind === 'sos' ? 'SOS' : '집 반경을 나갔습니다',
    body: alert.body,
  };
}

export async function handleSyncRequest(store, request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const op = await parseOperation(request);
  if (op instanceof Response) return op;
  if (op.kind === 'health') return json({ ok: true, service: 'umap-family-sync' });
  if (op.kind === 'vapid-public') return json({ error: 'vapid' }, 501);

  const room = (await store.read(op.token)) || emptyRoom();
  if (op.kind === 'get') return json(viewRoom(room, op.since));
  if (op.kind === 'family') return json(viewFamilyPlaces(room));
  if (op.kind === 'place') {
    const next = applyPlace(room, op.place);
    if (!next.ignored) await store.write(op.token, next.room);
    return json({ ok: true });
  }
  if (op.kind === 'alert') {
    const next = applyAlert(room, op.alert, Date.now());
    if (!next.ignored) await store.write(op.token, next.room);
    return json({ ok: true });
  }
  if (op.kind === 'push-subscribe') {
    await store.write(op.token, applySubscription(room, op.subscription));
    return json({ ok: true });
  }
  if (op.kind === 'push-remove') {
    await store.write(op.token, removeSubscriptions(room, op.endpoints || []));
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

export function createMemoryStore() {
  const rooms = new Map();
  return {
    async read(token) {
      return rooms.get(token) || emptyRoom();
    },
    async write(token, room) {
      rooms.set(token, room);
    },
  };
}

export async function syncTokenFor(writeKey, readKey) {
  return `${writeKey}.${await sha256Base64Url(readKey)}`;
}
