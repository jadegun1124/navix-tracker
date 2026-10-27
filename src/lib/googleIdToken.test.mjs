import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_SIGN_IN_SCOPES } from './authScopes.mjs';
import { decodeIdTokenPayload, signInFailureCopy, verifiedPhoneFromClaims } from './googleIdToken.mjs';

function token(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${body}.sig`;
}

test('id token payload decodes when base64url padding was stripped', () => {
  const credential = token({ sub: 'user-1', email: 'a@b.c', name: '나' });
  assert.equal(credential.split('.')[1].includes('='), false);
  const profile = decodeIdTokenPayload(credential);
  assert.equal(profile?.sub, 'user-1');
  assert.equal(profile?.name, '나');
  assert.equal(profile?.email, 'a@b.c');
  assert.equal(profile?.verifiedPhone, null);
});

test('unverified phone claim is not treated as the account phone', () => {
  assert.equal(verifiedPhoneFromClaims({ phone_number: '+821012345678' }), null);
  assert.equal(verifiedPhoneFromClaims({ phone_number: '+821012345678', phone_number_verified: false }), null);
  const profile = decodeIdTokenPayload(token({
    sub: 'user-2',
    email: 'a@b.c',
    name: '가족',
    phone_number: '+821099998888',
  }));
  assert.equal(profile?.verifiedPhone, null);
  assert.equal(JSON.stringify(profile).includes('99998888'), false);
});

test('verified phone claim is kept only as a verified value', () => {
  assert.equal(verifiedPhoneFromClaims({ phone_number: '+821012345678', phone_number_verified: true }), '+821012345678');
  assert.equal(verifiedPhoneFromClaims({ phone_number: '12', phone_number_verified: true }), null);
});

test('sign-in scopes do not include People API phone access', () => {
  assert.equal(GOOGLE_SIGN_IN_SCOPES.some((scope) => scope.includes('phone')), false);
  assert.match(signInFailureCopy('unregistered'), /Android OAuth/);
  assert.equal(decodeIdTokenPayload('not-a-jwt'), null);
});
