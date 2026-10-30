import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMemoryAccountStore,
  formatRecoveryCode,
  normalizeRecoveryCode,
  parseAccountOperation,
  publicAccount,
  sameMember,
} from './account.mjs';
import { createMemoryStore, handleSyncRequest, randomKey, syncTokenFor } from './protocol.mjs';
import {
  ACCOUNT_KEY_STORAGE,
  ACCOUNT_LINKS_STORAGE,
  RECOVERY_CODE_STORAGE,
  applyAccountSnapshot,
  currentAccountBackupEpoch,
  logoutLocalAccount,
  persistAccountSecretsIfCurrent,
  readStoredAccountLinks,
  rememberAccountSecrets,
  snapshotFromSession,
  writeStoredAccountKey,
  writeStoredRecoveryCode,
} from '../src/lib/accountRestore.mjs';

const LEFTOVER_GOOGLE_ACCOUNT_KEY = 'umap_google_account_v1';

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
    fetchKakaoUser: extras?.fetchKakaoUser,
    fetchNaverUser: extras?.fetchNaverUser,
    exchangeNaverCode: extras?.exchangeNaverCode,
    naverClientId: extras?.naverClientId,
    naverClientSecret: extras?.naverClientSecret,
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

test('Google login route is closed and leftover googleSub still recovers', async () => {
  const accounts = createMemoryAccountStore();
  const closed = await accountCall(accounts, 'POST', '/v1/account/google', {
    body: { idToken: 'unused' },
  });
  assert.equal(closed.status, 404);
  assert.equal(closed.body.error, 'method');

  const created = await accountCall(accounts, 'POST', '/v1/account', { body: snapshot() });
  assert.equal(created.status, 200);
  const recordId = await accounts.get('member:local-restore1');
  const record = await accounts.get(`acct:${recordId}`);
  record.googleSub = '1098234765';
  await accounts.put(`acct:${recordId}`, record);
  await accounts.put('google:1098234765', recordId);

  const recovered = await accountCall(accounts, 'POST', '/v1/account/recover', {
    body: { code: created.body.account.recoveryCode },
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.account.memberId, 'local-restore1');
  assert.equal(recovered.body.account.googleLinked, true);
  assert.equal(recovered.body.account.kakaoLinked, false);

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
    memberId: recovered.body.account.memberId,
  };
  const headers = { 'content-type': 'application/json', 'x-umap-sync-key': token, 'x-umap-profile-key': recovered.body.account.profileKey };
  const put = await handleSyncRequest(rooms, new Request(`http://sync.local/v1/rooms/${code}/place`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(place),
  }));
  assert.equal(put.status, 200);
  const view = await handleSyncRequest(rooms, new Request(`http://sync.local/v1/rooms/${code}/family`, {
    method: 'GET',
    headers: { 'x-umap-sync-key': token },
  }));
  const family = await view.json();
  const same = family.places.filter((item) => item.memberId === 'local-restore1');
  assert.equal(same.length, 1);
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

test('a stale backup after recover updates the same account and does not mint a second book', async () => {
  const accounts = createMemoryAccountStore();
  const created = await accountCall(accounts, 'POST', '/v1/account', { body: snapshot() });
  assert.equal(created.status, 200);
  const oldKey = created.body.account.accountKey;
  const recovery = created.body.account.recoveryCode;

  const recovered = await accountCall(accounts, 'POST', '/v1/account/recover', { body: { code: recovery } });
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.body.account.accountKey, oldKey);

  const stale = await accountCall(accounts, 'PUT', '/v1/account', {
    accountKey: oldKey,
    body: snapshot({
      journeys: [{
        id: 'j-2',
        startedAt: Date.now() - 2_000_000,
        endedAt: Date.now() - 1_800_000,
        distanceM: 400,
        points: [
          { lat: 37.6365, lng: 127.0680, at: Date.now() - 2_000_000 },
          { lat: 37.6368, lng: 127.0684, at: Date.now() - 1_800_000 },
        ],
        start: { lat: 37.6365, lng: 127.0680, label: '하계1차청구아파트 104동' },
        end: { lat: 37.6368, lng: 127.0684, label: '하계동' },
      }],
    }),
  });
  assert.equal(stale.status, 200);
  assert.equal(stale.body.account.memberId, 'local-restore1');
  assert.equal(stale.body.account.recoveryCode, recovery);
  assert.equal(stale.body.account.journeys[0].id, 'j-2');
  assert.notEqual(stale.body.account.accountKey, oldKey);

  const replay = await accountCall(accounts, 'POST', '/v1/account', { body: snapshot() });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.account.memberId, 'local-restore1');
  assert.equal(replay.body.account.recoveryCode, recovery);

  const other = await accountCall(accounts, 'POST', '/v1/account', {
    body: snapshot({ profileKey: 'otherkeyAAAAAAAAAA' }),
  });
  assert.equal(other.status, 409);
});

test('Kakao and Naver tokens restore the same book and can share one account', async () => {
  const accounts = createMemoryAccountStore();
  const extras = {
    fetchKakaoUser: async (token) => {
      if (token !== 'kakao-access-ok') throw new Error('kakao');
      return { id: 123456789, kakao_account: { profile: { nickname: '엄마' } } };
    },
    fetchNaverUser: async (token) => {
      if (token !== 'naver-access-ok') throw new Error('naver');
      return { resultcode: '00', response: { id: 'naver-user-88', nickname: '엄마' } };
    },
    exchangeNaverCode: async ({ code, state, redirectUri, clientId, clientSecret }) => {
      if (
        code !== 'naver-code-1'
        || state !== 'state-1'
        || redirectUri !== 'kinnex://naver'
        || clientId !== 'naverclientid1'
        || clientSecret !== 'naversecret1'
      ) {
        return null;
      }
      return { access_token: 'naver-access-ok' };
    },
    naverClientId: 'naverclientid1',
    naverClientSecret: 'naversecret1',
  };

  const kakao = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    body: { accessToken: 'kakao-access-ok', snapshot: snapshot() },
    extras,
  });
  assert.equal(kakao.status, 200);
  assert.equal(kakao.body.account.memberId, 'local-restore1');
  assert.equal(kakao.body.account.kakaoLinked, true);
  assert.equal(kakao.body.account.googleLinked, false);

  const naver = await accountCall(accounts, 'POST', '/v1/account/naver', {
    accountKey: kakao.body.account.accountKey,
    body: { code: 'naver-code-1', state: 'state-1', redirectUri: 'kinnex://naver' },
    extras,
  });
  assert.equal(naver.status, 200);
  assert.equal(naver.body.account.memberId, 'local-restore1');
  assert.equal(naver.body.account.kakaoLinked, true);
  assert.equal(naver.body.account.naverLinked, true);

  const restored = await accountCall(accounts, 'POST', '/v1/account/naver', {
    body: { accessToken: 'naver-access-ok', snapshot: snapshot({ memberId: 'local-newphone2', profileKey: 'otherkeyAAAAAAAAAA' }) },
    extras,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.restored, true);
  assert.equal(restored.body.account.memberId, 'local-restore1');

  const forged = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    body: { accessToken: 'wrong-token' },
    extras,
  });
  assert.equal(forged.status, 401);

  const missingSecret = await accountCall(accounts, 'POST', '/v1/account/naver', {
    body: { code: 'naver-code-1', state: 'state-1', redirectUri: 'kinnex://naver' },
    extras: { ...extras, naverClientSecret: '' },
  });
  assert.equal(missingSecret.status, 503);
  assert.match(missingSecret.body.message, /NAVER_CLIENT_SECRET/);

  const missingRedirect = await accountCall(accounts, 'POST', '/v1/account/naver', {
    body: { code: 'naver-code-1', state: 'state-1' },
    extras,
  });
  assert.equal(missingRedirect.status, 401);

  const forgedRedirect = await accountCall(accounts, 'POST', '/v1/account/naver', {
    body: { code: 'naver-code-1', state: 'state-1', redirectUri: 'https://evil.example/callback' },
    extras,
  });
  assert.equal(forgedRedirect.status, 401);
});

test('linking someone else\'s Kakao does not rotate that session', async () => {
  const accounts = createMemoryAccountStore();
  const extras = {
    fetchKakaoUser: async () => ({ id: 123456789, kakao_account: { profile: { nickname: '엄마' } } }),
  };
  const owner = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    body: { accessToken: 'kakao-access-ok', snapshot: snapshot() },
    extras,
  });
  assert.equal(owner.status, 200);
  const ownerId = await accounts.get('member:local-restore1');
  const before = await accounts.get(`acct:${ownerId}`);

  const other = await accountCall(accounts, 'POST', '/v1/account', {
    body: snapshot({
      memberId: 'local-otherphone',
      profileKey: 'otherkeyAAAAAAAAAA',
      profile: { name: '아빠', photo: null },
      room: { code: '10002', writeKey: 'writeKeyBBBBBBBBBB', readKey: 'readKeyBBBBBBBBBBB' },
    }),
  });
  assert.equal(other.status, 200);
  const conflict = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    accountKey: other.body.account.accountKey,
    body: {
      accessToken: 'kakao-access-ok',
      mode: 'link',
      accountKey: other.body.account.accountKey,
    },
    extras,
  });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.message, /다른 사람/);
  const after = await accounts.get(`acct:${ownerId}`);
  assert.equal(after.sessionHash, before.sessionHash);
  assert.equal(after.kakaoId, '123456789');

  const same = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    accountKey: owner.body.account.accountKey,
    body: {
      accessToken: 'kakao-access-ok',
      mode: 'link',
      accountKey: owner.body.account.accountKey,
    },
    extras,
  });
  assert.equal(same.status, 200);
  assert.equal(same.body.account.memberId, 'local-restore1');
  assert.equal(same.body.account.accountKey, owner.body.account.accountKey);

  const missed = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    accountKey: 'missingKeyAAAAAAAAA',
    body: {
      accessToken: 'kakao-access-ok',
      mode: 'link',
      accountKey: 'missingKeyAAAAAAAAA',
    },
    extras,
  });
  assert.equal(missed.status, 404);
  const still = await accounts.get(`acct:${ownerId}`);
  assert.equal(still.sessionHash, before.sessionHash);
});

test('link mode does not mint an account when this phone has no session', async () => {
  const accounts = createMemoryAccountStore();
  const extras = {
    fetchKakaoUser: async () => ({ id: 555666777, kakao_account: { profile: { nickname: '엄마' } } }),
  };
  const missing = await accountCall(accounts, 'POST', '/v1/account/kakao', {
    body: { accessToken: 'kakao-access-ok', mode: 'link', snapshot: snapshot() },
    extras,
  });
  assert.equal(missing.status, 404);
  assert.equal(await accounts.get('kakao:555666777'), undefined);
  assert.equal(await accounts.get('member:local-restore1'), undefined);
});

test('logout wipes the stored account key so the next sign-in does not reuse the previous person', () => {
  const storage = new Map();
  const fake = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  };
  writeStoredAccountKey(fake, 'accountKeyAAAAAAAAAA');
  writeStoredRecoveryCode(fake, 'ABCDEFGHJKLN');
  rememberAccountSecrets(fake, {
    accountKey: 'accountKeyAAAAAAAAAA',
    recoveryCode: 'ABCDEFGHJKLN',
    kakaoLinked: true,
    naverLinked: true,
  });
  assert.deepEqual(readStoredAccountLinks(fake), { kakao: true, naver: true });
  rememberAccountSecrets(fake, {
    accountKey: 'accountKeyBBBBBBBBBB',
    recoveryCode: 'ABCDEFGHJKLN',
    kakaoLinked: false,
    naverLinked: false,
  });
  assert.deepEqual(readStoredAccountLinks(fake), { kakao: false, naver: false });
  fake.setItem(LEFTOVER_GOOGLE_ACCOUNT_KEY, JSON.stringify({ sub: '1098234765', localId: 'local-restore1' }));
  const epoch = currentAccountBackupEpoch();
  logoutLocalAccount(fake);
  assert.equal(fake.getItem(ACCOUNT_KEY_STORAGE), null);
  assert.equal(fake.getItem(RECOVERY_CODE_STORAGE), null);
  assert.equal(fake.getItem(ACCOUNT_LINKS_STORAGE), null);
  assert.equal(fake.getItem(LEFTOVER_GOOGLE_ACCOUNT_KEY), null);
  assert.equal(persistAccountSecretsIfCurrent(fake, {
    memberId: 'local-restore1',
    profileKey: 'profilekeyAAAAAAAA',
    profile: { name: '엄마' },
    room: { code: '48291', writeKey: 'writeKeyAAAAAAAAAA', readKey: 'readKeyAAAAAAAAAAA' },
    accountKey: 'accountKeyAAAAAAAAAA',
    recoveryCode: 'ABCDEFGHJKLN',
  }, epoch), false);
  assert.equal(fake.getItem(ACCOUNT_KEY_STORAGE), null);
  assert.equal(fake.getItem(RECOVERY_CODE_STORAGE), null);
  assert.notEqual(currentAccountBackupEpoch(), epoch);
});
