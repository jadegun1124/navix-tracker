import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  ACCOUNT_SETUP_MESSAGE,
  ACCOUNT_VERIFY_MESSAGE,
  createMemoryAccountStore,
  formatRecoveryCode,
  handleAccountOperation,
  normalizeRecoveryCode,
  parseAccountOperation,
  publicAccount,
  sameMember,
} from './account.mjs';
import { createMemoryStore, handleSyncRequest, randomKey, syncTokenFor } from './protocol.mjs';
import { GOOGLE_SETUP_MESSAGE } from '../src/lib/googleAuth.mjs';
import { applyAccountSnapshot, snapshotFromSession } from '../src/lib/accountRestore.mjs';

const CLIENT = '1234567890-abc.apps.googleusercontent.com';

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function tokenFor(privateKey, payload, kid = 'kid-1') {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const input = `${header}.${body}`;
  const signature = createSign('RSA-SHA256').update(input).sign(privateKey);
  return `${input}.${b64url(signature)}`;
}

function snapshot(overrides = {}) {
  return {
    memberId: 'local-restore1',
    profileKey: 'profilekeyAAAAAAAA',
    profile: { name: '엄마', photo: null },
    room: { code: '48291', writeKey: 'writeKeyAAAAAAAAAA', readKey: 'readKeyAAAAAAAAAAA' },
    guardians: [],
    home: null,
    journeys: [{
      id: 'j-1',
      startedAt: Date.now() - 3_600_000,
      endedAt: Date.now() - 3_000_000,
      distanceM: 900,
      points: [
        { lat: 37.6365, lng: 127.0680, at: Date.now() - 3_600_000 },
        { lat: 37.6370, lng: 127.0690, at: Date.now() - 3_000_000 },
      ],
      start: { lat: 37.6365, lng: 127.0680, label: '하계1차청구아파트 104동' },
      end: { lat: 37.6370, lng: 127.0690, label: '하계동' },
    }],
    visits: [{
      id: 'v-1',
      lat: 37.6365,
      lng: 127.0680,
      arrivedAt: Date.now() - 3_600_000,
      leftAt: Date.now() - 3_000_000,
      label: '하계1차청구아파트 104동',
      source: 'geocode',
    }],
    ...overrides,
  };
}

async function accountCall(accounts, method, path, { body, accountKey, extras } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (accountKey) headers.set('x-umap-account-key', accountKey);
  const request = new Request(`http://sync.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rooms = createMemoryStore();
  const response = await handleSyncRequest(rooms, request, {
    accounts,
    clientId: CLIENT,
    fetchCerts: extras?.fetchCerts,
    now: extras?.now,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('recovery code is 12 characters and restores the same member', async () => {
  const accounts = createMemoryAccountStore();
  const created = await accountCall(accounts, 'POST', '/v1/account', { body: snapshot() });
  assert.equal(created.status, 200);
  assert.equal(created.body.account.memberId, 'local-restore1');
  const code = normalizeRecoveryCode(created.body.account.recoveryCode);
  assert.equal(code.length, 12);
  assert.equal(formatRecoveryCode(code), created.body.account.recoveryCode);

  const recovered = await accountCall(accounts, 'POST', '/v1/account/recover', { body: { code } });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.restored, true);
  assert.equal(recovered.body.account.memberId, 'local-restore1');
  assert.equal(recovered.body.account.room.code, '48291');
  assert.equal(recovered.body.account.journeys[0].id, 'j-1');
  assert.equal(sameMember(created.body.account, recovered.body.account), true);

  const missing = await accountCall(accounts, 'POST', '/v1/account/recover', { body: { code: 'ABCD-EFGH-IJKL' } });
  assert.equal(missing.status, 403);
});

test('Google ID token restore keeps the original member and does not mint a second card', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const now = 1_700_000_000_000;
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT,
    exp: Math.floor(now / 1000) + 600,
    sub: '1098234765',
    name: '엄마',
    email: 'parent@example.com',
  };
  const fetchCerts = async () => ({ keys: [{ kid: 'kid-1', kty: 'RSA', n: jwk.n, e: jwk.e }] });
  const extras = { fetchCerts, now };
  const accounts = createMemoryAccountStore();
  const first = await accountCall(accounts, 'POST', '/v1/account/google', {
    body: { idToken: tokenFor(privateKey, payload), snapshot: snapshot() },
    extras,
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.account.memberId, 'local-restore1');
  assert.equal(first.body.account.googleLinked, true);

  const duplicateSnapshot = snapshot({ memberId: 'local-newphone2', profileKey: 'otherkeyAAAAAAAAAA' });
  const again = await accountCall(accounts, 'POST', '/v1/account/google', {
    body: { idToken: tokenFor(privateKey, payload), snapshot: duplicateSnapshot },
    extras,
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.restored, true);
  assert.equal(again.body.account.memberId, 'local-restore1');
  assert.notEqual(again.body.account.memberId, duplicateSnapshot.memberId);

  const rooms = createMemoryStore();
  const writeKey = randomKey();
  const readKey = randomKey();
  const token = await syncTokenFor(writeKey, readKey);
  const code = '48291';
  const place = {
    code,
    name: '엄마',
    lat: 37.6365,
    lng: 127.0680,
    accuracyM: 12,
    at: Date.now(),
    sharing: true,
    audience: 'family',
    memberId: first.body.account.memberId,
  };
  const headers = { 'content-type': 'application/json', 'x-umap-sync-key': token, 'x-umap-profile-key': first.body.account.profileKey };
  const put = await handleSyncRequest(rooms, new Request(`http://sync.local/v1/rooms/${code}/place`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(place),
  }));
  assert.equal(put.status, 200);
  const replay = await handleSyncRequest(rooms, new Request(`http://sync.local/v1/rooms/${code}/place`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...place, at: Date.now() + 1000, lat: 37.6366, lng: 127.0681 }),
  }));
  assert.equal(replay.status, 200);
  const view = await handleSyncRequest(rooms, new Request(`http://sync.local/v1/rooms/${code}/family`, {
    method: 'GET',
    headers: { 'x-umap-sync-key': token },
  }));
  const family = await view.json();
  const same = family.places.filter((item) => item.memberId === 'local-restore1');
  assert.equal(same.length, 1);
  assert.equal(family.places.length, 1);

  const forged = await accountCall(accounts, 'POST', '/v1/account/google', {
    body: { idToken: tokenFor(privateKey, payload), snapshot: snapshot() },
    extras: {
      now,
      fetchCerts: async () => {
        const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
        return { keys: [{ kid: 'kid-1', kty: 'RSA', n: wrong.n, e: wrong.e }] };
      },
    },
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.message, ACCOUNT_VERIFY_MESSAGE);

  const missing = await handleAccountOperation(accounts, { kind: 'account-google', idToken: tokenFor(privateKey, payload), snapshot: snapshot() }, {
    clientId: '',
    fetchCerts,
    now,
  });
  assert.equal(missing.status, 503);
  const missingBody = await missing.json();
  assert.equal(missingBody.message, ACCOUNT_SETUP_MESSAGE);
  assert.equal(GOOGLE_SETUP_MESSAGE.includes('VITE_GOOGLE_WEB_CLIENT_ID'), true);
});

test('restoring a snapshot reapplies the same person, room keys, and records', () => {
  const account = publicAccount({
    memberId: 'local-restore1',
    profileKey: 'profilekeyAAAAAAAA',
    profile: { name: '엄마', photo: null },
    room: { code: '48291', writeKey: 'writeKeyAAAAAAAAAA', readKey: 'readKeyAAAAAAAAAAA' },
    guardians: [{ id: 'g-1', label: '가족', code: '48291', share: 'allowed' }],
    home: null,
    journeys: [{ id: 'j-1', startedAt: 1, endedAt: 2, distanceM: 100, points: [], start: { lat: 1, lng: 1, label: '하계동' }, end: { lat: 2, lng: 2, label: '중계동' } }],
    visits: [{ id: 'v-1', lat: 37.6365, lng: 127.0680, arrivedAt: 1, leftAt: 2, label: '하계1차청구아파트 104동', source: 'geocode' }],
    recoveryCode: 'ABCDEFGHJKLN',
    googleSub: '1098234765',
  });
  const fresh = {
    stage: 'login',
    profile: null,
    permissions: { completed: false },
    members: [],
    inviteCode: '10001',
    syncWriteKey: 'oldWriteKeyAAAAAAAA',
    syncReadKey: 'oldReadKeyAAAAAAAAA',
    journeys: {},
    visits: {},
    tracks: {},
    guardians: [],
  };
  const restored = applyAccountSnapshot(fresh, account);
  assert.equal(restored.profile.id, 'local-restore1');
  assert.equal(restored.inviteCode, '48291');
  assert.equal(restored.syncWriteKey, 'writeKeyAAAAAAAAAA');
  assert.equal(restored.journeys.self[0].id, 'j-1');
  assert.equal(restored.visits.self[0].label, '하계1차청구아파트 104동');
  assert.equal(restored.members.some((member) => member.id !== 'self' && member.publisherId === 'local-restore1'), false);
  const shot = snapshotFromSession(restored);
  assert.equal(shot.memberId, 'local-restore1');
  assert.equal(shot.room.code, '48291');
});

test('account routes stay out of family rooms when the path is wrong', async () => {
  const op = await parseAccountOperation(new Request('http://sync.local/v1/rooms/48291', { method: 'GET' }));
  assert.equal(op, null);
});
