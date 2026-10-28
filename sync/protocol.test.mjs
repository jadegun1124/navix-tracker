import assert from 'node:assert/strict';
import test from 'node:test';
import { startSyncServer } from './dev-server.mjs';
import { bytesToBase64Url } from './webpush.mjs';
import {
  applyPlace,
  createMemoryStore,
  emptyRoom,
  handleSyncRequest,
  randomKey,
  roomToken,
  sha256Base64Url,
  syncTokenFor,
  withCors,
} from './protocol.mjs';

async function call(store, method, path, { token, readKey, body } = {}) {
  const headers = new Headers();
  if (token) headers.set('x-umap-sync-key', token);
  if (readKey) headers.set('x-umap-read-key', readKey);
  if (body !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(`http://sync.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handleSyncRequest(store, request);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('hash vector stays stable for the client copy', async () => {
  assert.equal(await sha256Base64Url('umap-read-key'), 'BL04F54qEIA94kVM3un2L2ITH4kcV-H8m2JJNnuuHVQ');
});

test('managed publish is visible only to the admin read key, and revoke clears coordinates', async () => {
  const store = createMemoryStore();
  const code = '48291';
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const place = {
    code,
    name: '하나',
    lat: 37.64,
    lng: 127.07,
    accuracyM: 12,
    at: Date.now(),
    sharing: true,
    phone: '01012345678',
  };

  const published = await call(store, 'PUT', `/v1/rooms/${code}/place`, { token, body: place });
  assert.equal(published.status, 200);
  assert.deepEqual(published.body, { ok: true });

  const hidden = await call(store, 'GET', `/v1/rooms/${code}`, { token });
  assert.equal(hidden.status, 403);

  const wrongRead = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey: randomKey() });
  assert.equal(wrongRead.status, 403);

  const other = await call(store, 'GET', `/v1/rooms/${code}`, {
    token: await syncTokenFor(randomKey(), readKey),
    readKey,
  });
  assert.equal(other.status, 200);
  assert.deepEqual(other.body.places, []);

  const visible = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(visible.status, 200);
  assert.equal(visible.body.places.length, 1);
  assert.equal(visible.body.places[0].name, '하나');
  assert.equal(visible.body.places[0].lat, 37.64);
  assert.equal(JSON.stringify(visible.body).includes('010'), false);
  assert.equal(visible.body.places[0].phone, undefined);

  const revoked = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
    token,
    body: { ...place, lat: 37.64, lng: 127.07, sharing: false, at: place.at + 1000, phone: '01099998888' },
  });
  assert.equal(revoked.status, 200);
  const after = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(after.body.places[0].sharing, false);
  assert.equal(after.body.places[0].lat, null);
  assert.equal(after.body.places[0].lng, null);

  const stale = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
    token,
    body: { code, name: '하나', lat: 37.1, lng: 127.1, accuracyM: 8, at: place.at + 500, sharing: true },
  });
  assert.equal(stale.status, 200);
  const stillRevoked = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(stillRevoked.body.places[0].sharing, false);
  assert.equal(stillRevoked.body.places[0].lat, null);
});

test('two names stay in one room and alerts reach only the reader', async () => {
  const store = createMemoryStore();
  const code = '12045';
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const now = Date.now();
  for (const name of ['하나', '두리']) {
    const response = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
      token,
      body: { code, name, lat: 37.5, lng: 127.0, accuracyM: 20, at: now, sharing: true },
    });
    assert.equal(response.status, 200);
  }
  const alert = await call(store, 'POST', `/v1/rooms/${code}/alert`, {
    token,
    body: {
      id: 'a-leave-10000001',
      kind: 'leave',
      code,
      from: '하나',
      body: '하나 님이 우리 집 반경 200m 밖으로 나갔습니다.',
      at: now + 10,
      phone: '01000000000',
    },
  });
  assert.equal(alert.status, 200);

  const reader = await call(store, 'GET', `/v1/rooms/${code}?since=${now}`, { token, readKey });
  assert.equal(reader.body.places.length, 2);
  assert.equal(reader.body.alerts.length, 1);
  assert.equal(reader.body.alerts[0].kind, 'leave');
  assert.equal(reader.body.alerts[0].phone, undefined);

  const again = await call(store, 'GET', `/v1/rooms/${code}?since=${now + 10}`, { token, readKey });
  assert.equal(again.body.alerts.length, 0);
  assert.equal(again.body.places.length, 2);
});

test('missing sync key and bad coordinates are rejected', async () => {
  const store = createMemoryStore();
  const missing = await call(store, 'PUT', '/v1/rooms/12345/place', {
    body: { code: '12345', name: '하나', lat: 1, lng: 1, accuracyM: 1, at: Date.now(), sharing: true },
  });
  assert.equal(missing.status, 401);

  const token = await syncTokenFor(randomKey(), randomKey());
  const bad = await call(store, 'PUT', '/v1/rooms/12345/place', {
    token,
    body: { code: '12345', name: '하나', lat: 120, lng: 10, accuracyM: 1, at: Date.now(), sharing: true },
  });
  assert.equal(bad.status, 400);
});

test('health and dev server move a place between two clients', async () => {
  const store = createMemoryStore();
  const health = await call(store, 'GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.service, 'umap-family-sync');

  const cors = withCors(new Response(null, { status: 204 }));
  assert.equal(cors.headers.get('access-control-allow-origin'), '*');
  assert.match(cors.headers.get('access-control-allow-headers') || '', /x-umap-read-key/);

  const server = await startSyncServer(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const probed = await fetch(`${base}/health`);
    assert.equal((await probed.json()).ok, true);

    const writeKey = randomKey();
    const readKey = randomKey();
    const token = await syncTokenFor(writeKey, readKey);
    const code = '55501';
    const put = await fetch(`${base}/v1/rooms/${code}/place`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-umap-sync-key': token },
      body: JSON.stringify({
        code,
        name: '하나',
        lat: 37.6412,
        lng: 127.0711,
        accuracyM: 9,
        at: Date.now(),
        sharing: true,
      }),
    });
    assert.equal(put.status, 200);

    const got = await fetch(`${base}/v1/rooms/${code}`, {
      headers: { 'x-umap-sync-key': token, 'x-umap-read-key': readKey },
    });
    const payload = await got.json();
    assert.equal(payload.places[0].lat, 37.6412);

    const revoke = await fetch(`${base}/v1/rooms/${code}/place`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-umap-sync-key': token },
      body: JSON.stringify({
        code,
        name: '하나',
        lat: 37.6412,
        lng: 127.0711,
        accuracyM: 9,
        at: Date.now() + 5,
        sharing: false,
      }),
    });
    assert.equal(revoke.status, 200);
    const cleared = await fetch(`${base}/v1/rooms/${code}`, {
      headers: { 'x-umap-sync-key': token, 'x-umap-read-key': readKey },
    });
    const after = await cleared.json();
    assert.equal(after.places[0].sharing, false);
    assert.equal(after.places[0].lat, null);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});

test('same coordinates with a newer timestamp refresh the day, and an older replay does not', () => {
  const room = emptyRoom();
  const yesterday = Date.UTC(2026, 9, 26, 10, 0);
  const today = Date.UTC(2026, 9, 27, 1, 0);
  const first = applyPlace(room, {
    code: '10001',
    name: '하나',
    lat: 37.5,
    lng: 127,
    accuracyM: 8,
    at: yesterday,
    sharing: true,
    batteryPct: 70,
    charging: false,
    audience: 'admin',
  });
  const replay = applyPlace(first.room, {
    code: '10001',
    name: '하나',
    lat: 37.5,
    lng: 127,
    accuracyM: 8,
    at: yesterday,
    sharing: true,
    batteryPct: 70,
    charging: false,
    audience: 'admin',
  });
  assert.equal(replay.ignored, true);
  const refreshed = applyPlace(first.room, {
    code: '10001',
    name: '하나',
    lat: 37.5,
    lng: 127,
    accuracyM: 9,
    at: today,
    sharing: true,
    batteryPct: 40,
    charging: true,
    audience: 'admin',
  });
  assert.equal(refreshed.ignored, false);
  assert.equal(refreshed.room.places['하나'].at, today);
  assert.equal(refreshed.room.places['하나'].batteryPct, 40);
  assert.equal(refreshed.room.places['하나'].charging, true);
  const stale = applyPlace(refreshed.room, {
    code: '10001',
    name: '하나',
    lat: 37.6,
    lng: 127.1,
    accuracyM: 8,
    at: yesterday,
    sharing: true,
    audience: 'admin',
  });
  assert.equal(stale.ignored, true);
  assert.equal(stale.room.places['하나'].at, today);
  assert.equal(stale.room.places['하나'].lat, 37.5);
});

test('alert cursor does not hide places, and family share stays behind the write key', async () => {
  const store = createMemoryStore();
  const code = '24680';
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const at = Date.now();
  const child = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
    token,
    body: {
      code,
      name: '하나',
      lat: 37.1,
      lng: 127.1,
      accuracyM: 6,
      at,
      sharing: true,
      batteryPct: 88,
      charging: false,
      phone: '01011112222',
    },
  });
  assert.equal(child.status, 200);
  const admin = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
    token,
    body: {
      code,
      name: '하나',
      lat: 37.2,
      lng: 127.2,
      accuracyM: 5,
      at: at + 5,
      sharing: true,
      audience: 'family',
      batteryPct: 55,
      charging: true,
    },
  });
  assert.equal(admin.status, 200);

  const reader = await call(store, 'GET', `/v1/rooms/${code}?since=${at + 5}`, { token, readKey });
  assert.equal(reader.status, 200);
  assert.equal(reader.body.places.length, 2);
  assert.equal(reader.body.alerts.length, 0);
  const childPlace = reader.body.places.find((place) => place.audience !== 'family');
  const familyPlace = reader.body.places.find((place) => place.audience === 'family');
  assert.equal(childPlace.lat, 37.1);
  assert.equal(childPlace.batteryPct, 88);
  assert.equal(childPlace.phone, undefined);
  assert.equal(familyPlace.lat, 37.2);
  assert.equal(familyPlace.charging, true);

  const hidden = await call(store, 'GET', `/v1/rooms/${code}/family`);
  assert.equal(hidden.status, 401);
  const managed = await call(store, 'GET', `/v1/rooms/${code}/family`, { token });
  assert.equal(managed.status, 200);
  assert.equal(managed.body.places.length, 1);
  assert.equal(managed.body.places[0].audience, 'family');
  assert.equal(managed.body.places[0].name, '하나');
  assert.equal(JSON.stringify(managed.body).includes('37.1'), false);

  const stopped = await call(store, 'PUT', `/v1/rooms/${code}/place`, {
    token,
    body: { code, name: '하나', lat: null, lng: null, accuracyM: 0, at: at + 10, sharing: false, audience: 'family' },
  });
  assert.equal(stopped.status, 200);
  const after = await call(store, 'GET', `/v1/rooms/${code}/family`, { token });
  assert.deepEqual(after.body.places, []);
  const childStill = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(childStill.body.places.find((place) => place.audience !== 'family').lat, 37.1);
});

test('bad battery and audience are rejected', async () => {
  const store = createMemoryStore();
  const token = await syncTokenFor(randomKey(), randomKey());
  const battery = await call(store, 'PUT', '/v1/rooms/33333/place', {
    token,
    body: { code: '33333', name: '하나', lat: 37, lng: 127, accuracyM: 4, at: Date.now(), sharing: true, batteryPct: 140 },
  });
  assert.equal(battery.status, 400);
  const audience = await call(store, 'PUT', '/v1/rooms/33333/place', {
    token,
    body: { code: '33333', name: '하나', lat: 37, lng: 127, accuracyM: 4, at: Date.now(), sharing: true, audience: 'world' },
  });
  assert.equal(audience.status, 400);
});

test('older sharing change at the same timestamp is kept when the flag flips', () => {
  const room = emptyRoom();
  const first = applyPlace(room, {
    code: '10001',
    name: '하나',
    lat: 37,
    lng: 127,
    accuracyM: 5,
    at: 1_800_000_000_000,
    sharing: true,
  });
  const revoke = applyPlace(first.room, {
    code: '10001',
    name: '하나',
    lat: null,
    lng: null,
    accuracyM: 0,
    at: 1_800_000_000_000,
    sharing: false,
  });
  assert.equal(revoke.ignored, false);
  assert.equal(revoke.room.places['하나'].sharing, false);
});

test('a live fix survives an empty heartbeat, replaces a newer placeholder, and keeps battery', () => {
  const now = Date.UTC(2026, 9, 27, 3, 0);
  const first = applyPlace(emptyRoom(), {
    code: '10001',
    name: '하나',
    lat: 37.5,
    lng: 127,
    accuracyM: 8,
    at: now,
    sharing: true,
    batteryPct: 70,
    charging: false,
    audience: 'admin',
  });
  const heartbeat = applyPlace(first.room, {
    code: '10001',
    name: '하나',
    lat: null,
    lng: null,
    accuracyM: 0,
    at: now + 60_000,
    sharing: true,
    audience: 'admin',
  });
  assert.equal(heartbeat.ignored, true);
  assert.equal(heartbeat.room.places['하나'].lat, 37.5);
  assert.equal(heartbeat.room.places['하나'].batteryPct, 70);
  assert.equal(heartbeat.room.places['하나'].at, now);

  const placeholder = applyPlace(emptyRoom(), {
    code: '10001',
    name: '하나',
    lat: null,
    lng: null,
    accuracyM: 0,
    at: now + 60_000,
    sharing: true,
    audience: 'admin',
  });
  const fix = applyPlace(placeholder.room, {
    code: '10001',
    name: '하나',
    lat: 37.2,
    lng: 127.2,
    accuracyM: 9,
    at: now,
    sharing: true,
    batteryPct: 41,
    charging: true,
    audience: 'admin',
  });
  assert.equal(fix.ignored, false);
  assert.equal(fix.room.places['하나'].lat, 37.2);
  assert.equal(fix.room.places['하나'].batteryPct, 41);

  const moved = applyPlace(fix.room, {
    code: '10001',
    name: '하나',
    lat: 37.3,
    lng: 127.3,
    accuracyM: 7,
    at: now + 120_000,
    sharing: true,
    audience: 'admin',
  });
  assert.equal(moved.room.places['하나'].lat, 37.3);
  assert.equal(moved.room.places['하나'].batteryPct, 41);
  assert.equal(moved.room.places['하나'].charging, true);

  const revoked = applyPlace(moved.room, {
    code: '10001',
    name: '하나',
    lat: null,
    lng: null,
    accuracyM: 0,
    at: now + 180_000,
    sharing: false,
    audience: 'admin',
  });
  assert.equal(revoked.room.places['하나'].sharing, false);
  assert.equal(revoked.room.places['하나'].lat, null);
});

test('SOS push subscription is kept for the admin reader and hidden from the room view', async () => {
  const store = createMemoryStore();
  const code = '13579';
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const key = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/umap-test-device',
    p256dh: bytesToBase64Url(publicRaw),
    auth: bytesToBase64Url(auth),
    phone: '01012345678',
  };
  const denied = await call(store, 'PUT', `/v1/rooms/${code}/push`, { token, body: subscription });
  assert.equal(denied.status, 403);
  const saved = await call(store, 'PUT', `/v1/rooms/${code}/push`, { token, readKey, body: subscription });
  assert.equal(saved.status, 200);
  const local = await call(store, 'PUT', `/v1/rooms/${code}/push`, {
    token,
    readKey,
    body: { ...subscription, endpoint: 'https://127.0.0.1/push' },
  });
  assert.equal(local.status, 400);

  const reader = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(JSON.stringify(reader.body).includes('fcm.googleapis.com'), false);
  assert.equal(JSON.stringify(reader.body).includes('010'), false);
  const id = await roomToken(code, writeKey, token.split('.')[1]);
  const room = await store.read(id);
  assert.equal(room.pushes.length, 1);
  assert.equal(room.pushes[0].phone, undefined);
  assert.equal(room.pushes[0].endpoint, subscription.endpoint);
});

test('family chat is readable by the admin and by the family token', async () => {
  const store = createMemoryStore();
  const code = '48291';
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const message = { id: 'chatmsg01', name: '하나', text: '집 근처예요', at: Date.now() };
  const posted = await call(store, 'POST', `/v1/rooms/${code}/chat`, { token, body: message });
  assert.equal(posted.status, 200);

  const reader = await call(store, 'GET', `/v1/rooms/${code}`, { token, readKey });
  assert.equal(reader.body.messages.length, 1);
  assert.equal(reader.body.messages[0].text, '집 근처예요');
  assert.equal(JSON.stringify(reader.body).includes('writeKey'), false);

  const family = await call(store, 'GET', `/v1/rooms/${code}/family`, { token });
  assert.equal(family.body.messages[0].name, '하나');
  const listed = await call(store, 'GET', `/v1/rooms/${code}/chat`, { token });
  assert.equal(listed.body.messages.length, 1);

  const phone = await call(store, 'POST', `/v1/rooms/${code}/chat`, {
    token,
    body: { id: 'chatmsg02', name: '하나', text: '01012345678', at: Date.now() },
  });
  assert.equal(phone.status, 400);
  const again = await call(store, 'POST', `/v1/rooms/${code}/chat`, { token, body: message });
  assert.equal(again.status, 200);
  const once = await call(store, 'GET', `/v1/rooms/${code}/chat`, { token });
  assert.equal(once.body.messages.length, 1);
});
