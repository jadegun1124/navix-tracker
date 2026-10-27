// Family location room. The latest point per consented name, plus recent alerts.
// Phone numbers are not accepted. The read key is never stored.

const KEY_PART = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_PART = /^\d{4,6}$/;
const ALERT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_BODY = 4096;
const MAX_PLACES = 20;
const MAX_ALERTS = 30;
const MAX_MESSAGES = 80;
const ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const MESSAGE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_AT = Date.UTC(2024, 0, 1);

export function emptyRoom() {
  return { places: {}, alerts: [], messages: [] };
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

function cleanPlace(input, code, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: json({ error: 'place' }, 400) };
  if (input.code !== code || !CODE_PART.test(code)) return { error: json({ error: 'code' }, 400) };
  if (typeof input.name !== 'string') return { error: json({ error: 'name' }, 400) };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: json({ error: 'name' }, 400) };
  if (typeof input.sharing !== 'boolean') return { error: json({ error: 'sharing' }, 400) };
  if (!cleanStamp(input.at, now)) return { error: json({ error: 'at' }, 400) };

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
      battery: cleanBattery(input.battery),
      mode: cleanMode(input.mode),
      speedMps: cleanSpeed(input.speedMps),
      segment: cleanSegment(input.segment),
      visits: cleanVisits(input.visits),
    },
  };
}

function cleanBattery(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value);
}

function cleanMode(value) {
  if (value === 'walk' || value === 'bike' || value === 'car' || value === 'plane' || value === 'still') return value;
  return null;
}

function cleanSpeed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 320) return null;
  return Math.round(value * 100) / 100;
}

function cleanCoord(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function cleanSegment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.id !== 'string' || !ALERT_ID.test(input.id)) return null;
  const mode = cleanMode(input.mode);
  if (mode !== 'walk' && mode !== 'bike' && mode !== 'car' && mode !== 'plane') return null;
  const fields = ['startAt', 'endAt', 'startLat', 'startLng', 'endLat', 'endLng', 'distanceM', 'topSpeedMps'];
  for (const field of fields) {
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field])) return null;
  }
  if (!cleanCoord(input.startLat, input.startLng) || !cleanCoord(input.endLat, input.endLng)) return null;
  if (input.distanceM < 0 || input.distanceM > 20_000_000 || input.endAt < input.startAt) return null;
  let steps = null;
  if (input.steps != null) {
    if (typeof input.steps !== 'number' || !Number.isFinite(input.steps) || input.steps < 0 || input.steps > 2_000_000) return null;
    steps = Math.round(input.steps);
  }
  const stepsSource = input.stepsSource === 'device' || input.stepsSource === 'estimate' ? input.stepsSource : null;
  const path = [];
  if (Array.isArray(input.path)) {
    for (const point of input.path) {
      if (!point || !cleanCoord(point.lat, point.lng)) continue;
      path.push({ lat: point.lat, lng: point.lng });
      if (path.length >= 8) break;
    }
  }
  return {
    id: input.id,
    mode,
    startAt: input.startAt,
    endAt: input.endAt,
    startLat: input.startLat,
    startLng: input.startLng,
    endLat: input.endLat,
    endLng: input.endLng,
    distanceM: Math.round(input.distanceM),
    topSpeedMps: Math.round(input.topSpeedMps * 100) / 100,
    steps,
    stepsSource,
    path,
  };
}

function cleanVisit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.id !== 'string' || !ALERT_ID.test(input.id)) return null;
  if (!cleanCoord(input.lat, input.lng)) return null;
  if (typeof input.startedAt !== 'number' || !Number.isFinite(input.startedAt)) return null;
  if (input.endedAt != null && (typeof input.endedAt !== 'number' || !Number.isFinite(input.endedAt))) return null;
  const label = typeof input.label === 'string' ? input.label.trim().slice(0, 40) : '';
  if (!label) return null;
  return {
    id: input.id,
    lat: input.lat,
    lng: input.lng,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    label,
  };
}

function cleanVisits(input) {
  if (!Array.isArray(input)) return [];
  const visits = [];
  for (const item of input) {
    const visit = cleanVisit(item);
    if (!visit) continue;
    visits.push(visit);
    if (visits.length >= 8) break;
  }
  return visits;
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

export function applyPlace(room, place) {
  const current = room.places[place.name];
  if (current && place.at < current.at) return { room, ignored: true };
  if (current && place.at === current.at && place.sharing === current.sharing) return { room, ignored: true };
  const places = { ...room.places, [place.name]: place };
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

function messageList(room) {
  return Array.isArray(room.messages) ? room.messages : [];
}

export function applyMessage(room, message, now) {
  const messages = messageList(room);
  if (messages.some((item) => item.id === message.id)) return { room, ignored: true };
  const next = [...messages, message].filter((item) => now - item.at < MESSAGE_TTL_MS).slice(-MAX_MESSAGES);
  return { room: { ...room, messages: next }, ignored: false };
}

export function viewMessages(room, since) {
  const cursor = Number.isFinite(since) ? since : 0;
  return messageList(room).filter((message) => message.at > cursor);
}

export function viewRoom(room, since, chatSince = 0) {
  const cursor = Number.isFinite(since) ? since : 0;
  return {
    places: Object.values(room.places),
    alerts: room.alerts.filter((alert) => alert.at > cursor),
    messages: viewMessages(room, chatSince),
  };
}

const FROM_ID = /^[\w.:@-]{1,80}$/;

function cleanMessage(input, code, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: json({ error: 'message' }, 400) };
  if (typeof input.id !== 'string' || !ALERT_ID.test(input.id)) return { error: json({ error: 'message' }, 400) };
  if (input.code !== code) return { error: json({ error: 'code' }, 400) };
  if (typeof input.from !== 'string' || typeof input.fromId !== 'string' || typeof input.body !== 'string') {
    return { error: json({ error: 'message' }, 400) };
  }
  const from = input.from.trim().slice(0, 80);
  const fromId = input.fromId.trim();
  const body = input.body.trim().slice(0, 500);
  if (!from || !FROM_ID.test(fromId) || !body) return { error: json({ error: 'message' }, 400) };
  if (!cleanStamp(input.at, now)) return { error: json({ error: 'at' }, 400) };
  return { message: { id: input.id, code, from, fromId, body, at: input.at } };
}

export async function parseOperation(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/health/')) {
    return { kind: 'health' };
  }

  const match = url.pathname.match(/^\/v1\/rooms\/(\d{4,6})(\/place|\/alert|\/message|\/messages)?\/?$/);
  if (!match) return json({ error: 'not-found' }, 404);
  const code = match[1];
  const action = match[2] || '';
  const token = splitSyncToken(request.headers.get('x-umap-sync-key') || '');
  if (!token) return json({ error: 'sync-key' }, 401);
  const id = await roomToken(code, token.writeKey, token.readKeyHash);

  if (request.method === 'GET' && action === '') {
    const readKey = request.headers.get('x-umap-read-key') || '';
    if (!isKeyPart(readKey)) return json({ error: 'read-key' }, 403);
    const actual = await sha256Base64Url(readKey);
    if (!safeEqual(actual, token.readKeyHash)) return json({ error: 'read-key' }, 403);
    const since = Number(url.searchParams.get('since') || 0);
    const chatSince = Number(url.searchParams.get('chatSince') || 0);
    return {
      kind: 'get',
      token: id,
      since: Number.isFinite(since) ? since : 0,
      chatSince: Number.isFinite(chatSince) ? chatSince : 0,
    };
  }

  if (request.method === 'GET' && action === '/messages') {
    const since = Number(url.searchParams.get('since') || 0);
    return { kind: 'messages', token: id, since: Number.isFinite(since) ? since : 0 };
  }

  if (request.method === 'PUT' && action === '/place') {
    const body = await readJson(request);
    if (body.error) return body.error;
    const cleaned = cleanPlace(body.value, code, Date.now());
    if (cleaned.error) return cleaned.error;
    return { kind: 'place', token: id, place: cleaned.place };
  }

  if (request.method === 'POST' && action === '/message') {
    const body = await readJson(request);
    if (body.error) return body.error;
    const cleaned = cleanMessage(body.value, code, Date.now());
    if (cleaned.error) return cleaned.error;
    return { kind: 'message', token: id, message: cleaned.message };
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

export async function handleSyncRequest(store, request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const op = await parseOperation(request);
  if (op instanceof Response) return op;
  if (op.kind === 'health') return json({ ok: true, service: 'umap-family-sync' });

  const room = (await store.read(op.token)) || emptyRoom();
  if (op.kind === 'get') return json(viewRoom(room, op.since, op.chatSince));
  if (op.kind === 'messages') return json({ messages: viewMessages(room, op.since) });
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
  if (op.kind === 'message') {
    const next = applyMessage(room, op.message, Date.now());
    if (!next.ignored) await store.write(op.token, next.room);
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
