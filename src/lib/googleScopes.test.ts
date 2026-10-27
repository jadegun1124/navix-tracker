import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_SIGN_IN_SCOPES, usesOnlyFreeGoogleSignInScopes } from './googleScopes.ts';

test('google sign-in stays on free openid email profile scopes', () => {
  assert.deepEqual([...GOOGLE_SIGN_IN_SCOPES], ['openid', 'email', 'profile']);
  assert.equal(usesOnlyFreeGoogleSignInScopes(), true);
  assert.equal(usesOnlyFreeGoogleSignInScopes(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive']), false);
});
