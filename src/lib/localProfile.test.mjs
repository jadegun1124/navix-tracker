import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceProfileKey, localProfile, looksLikePhone } from './localProfile.mjs';

test('local profile keeps a display name and a device id', () => {
  const profile = localProfile('  엄마  ', 'local-abc');
  assert.deepEqual(profile, { id: 'local-abc', name: '엄마' });
  const minted = localProfile('나');
  assert.equal(minted?.name, '나');
  assert.match(minted?.id ?? '', /^local-/);
});

test('phone-shaped text is not an identity', () => {
  assert.equal(looksLikePhone('010-1234-5678'), true);
  assert.equal(looksLikePhone('+82 10 1234 5678'), true);
  assert.equal(looksLikePhone('엄마'), false);
  assert.equal(localProfile('01012345678'), null);
  assert.equal(localProfile(''), null);
});

test('profile key stays on this device and is not a phone number', () => {
  const minted = deviceProfileKey();
  assert.match(minted, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(deviceProfileKey(minted), minted);
  assert.notEqual(deviceProfileKey('01012345678'), '01012345678');
});

test('a previous google subject is not reused as the local id', () => {
  const profile = localProfile('가족', '1098234');
  assert.match(profile?.id ?? '', /^local-/);
  assert.notEqual(profile?.id, '1098234');
});
