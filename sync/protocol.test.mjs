import assert from 'node:assert/strict';
import test from 'node:test';
import { startSyncServer } from './dev-server.mjs';
import {
  applyPlace,
  createMemoryStore,
  emptyRoom,
  handleSyncRequest,
  randomKey,
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
