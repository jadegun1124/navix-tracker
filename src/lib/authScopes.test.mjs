import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_SIGN_IN_SCOPES, isExactSignInScopeList } from './authScopes.mjs';

test('google sign-in scopes stay openid, email, and profile', () => {
  assert.deepEqual(GOOGLE_SIGN_IN_SCOPES, ['openid', 'email', 'profile']);
  assert.equal(isExactSignInScopeList(['openid', 'email', 'profile']), true);
  assert.equal(isExactSignInScopeList(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar']), false);
});
