import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  GOOGLE_SETUP_MESSAGE,
  GOOGLE_VERIFY_MESSAGE,
  googleWebClientId,
  profileFromGoogle,
  readGoogleAccount,
  verifyGoogleIdToken,
  writeGoogleAccount,
} from './googleAuth.mjs';

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

test('a missing or placeholder Google client id never signs in', () => {
  assert.equal(googleWebClientId(''), '');
  assert.equal(googleWebClientId('your-client-id.apps.googleusercontent.com'), '');
  assert.equal(googleWebClientId('not-a-google-client'), '');
  assert.equal(googleWebClientId(CLIENT), CLIENT);
  assert.match(GOOGLE_SETUP_MESSAGE, /VITE_GOOGLE_WEB_CLIENT_ID/);
  assert.match(GOOGLE_SETUP_MESSAGE, /kr\.co\.umap\.tracker/);
  assert.match(GOOGLE_SETUP_MESSAGE, /시작하지 않습니다/);
});

test('only a signed Google ID token becomes a local profile', async () => {
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
  const token = tokenFor(privateKey, payload);
  const fetchCerts = async () => ({ keys: [{ kid: 'kid-1', kty: 'RSA', n: jwk.n, e: jwk.e }] });
  const verified = await verifyGoogleIdToken(token, CLIENT, { now, fetchCerts });
  assert.equal(verified.ok, true);
  const linked = profileFromGoogle(verified.claims, null);
  assert.match(linked.profile.id, /^local-/);
  assert.notEqual(linked.profile.id, payload.sub);
  assert.equal(linked.profile.name, '엄마');
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  writeGoogleAccount(storage, linked.account);
  const again = profileFromGoogle(verified.claims, readGoogleAccount(storage));
  assert.equal(again.profile.id, linked.profile.id);

  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
  const forged = await verifyGoogleIdToken(token, CLIENT, {
    now,
    fetchCerts: async () => ({ keys: [{ kid: 'kid-1', kty: 'RSA', n: wrongKey.n, e: wrongKey.e }] }),
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.message, GOOGLE_VERIFY_MESSAGE);

  const expired = await verifyGoogleIdToken(tokenFor(privateKey, { ...payload, exp: 10 }), CLIENT, { now, fetchCerts });
  assert.equal(expired.ok, false);
  const otherApp = await verifyGoogleIdToken(tokenFor(privateKey, { ...payload, aud: 'other.apps.googleusercontent.com' }), CLIENT, { now, fetchCerts });
  assert.equal(otherApp.ok, false);
  const missing = await verifyGoogleIdToken(token, '', { now, fetchCerts });
  assert.equal(missing.ok, false);
  assert.equal(missing.message, GOOGLE_SETUP_MESSAGE);
});
