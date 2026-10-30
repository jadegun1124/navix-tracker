import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSeal,
  mintDeviceKey,
  mintFamilyKey,
  openJson,
  sealJson,
  unwrapFamilyKey,
  unwrapVault,
  wrapFamilyKey,
  wrapVault,
} from './familySeal.mjs';

test('a family key seals coordinates and a wrong key cannot open them', async () => {
  const family = await mintFamilyKey();
  const envelope = await sealJson(family.key, family.kid, { lat: 37.6365, lng: 127.068, label: '하계1차청구아파트' });
  assert.equal(isSeal(envelope), true);
  assert.equal(JSON.stringify(envelope).includes('37.6365'), false);
  assert.equal(JSON.stringify(envelope).includes('하계1차청구아파트'), false);
  const opened = await openJson(family.key, envelope);
  assert.equal(opened.label, '하계1차청구아파트');
  const other = await mintFamilyKey();
  assert.equal(await openJson(other.key, envelope), null);
});

test('X25519 wraps the family key for a member and rotation uses a new key', async () => {
  const family = await mintFamilyKey();
  const member = await mintDeviceKey();
  const outsider = await mintDeviceKey();
  const wrap = await wrapFamilyKey(member.publicKey, family.key, family.kid);
  const opened = await unwrapFamilyKey(member.privateKey, wrap, family.kid);
  assert.equal(Buffer.from(opened).toString('base64url'), Buffer.from(family.key).toString('base64url'));
  assert.equal(await unwrapFamilyKey(outsider.privateKey, wrap, family.kid), null);
  const next = await mintFamilyKey();
  assert.notEqual(next.kid, family.kid);
  const rotated = await wrapFamilyKey(member.publicKey, next.key, next.kid);
  const again = await unwrapFamilyKey(member.privateKey, rotated, next.kid);
  assert.equal(Buffer.from(again).equals(next.key), true);
  assert.equal(await unwrapFamilyKey(member.privateKey, rotated, family.kid), null);
});

test('the recovery code unwraps the account vault and the wrong code does not', async () => {
  const device = await mintDeviceKey();
  const code = 'ABCD2345EFGH';
  const vault = await wrapVault(code, device);
  assert.equal(JSON.stringify(vault).includes(device.privateKey), false);
  const opened = await unwrapVault(code, vault);
  assert.equal(opened.privateKey, device.privateKey);
  assert.equal(opened.contentKey, device.contentKey);
  assert.equal(await unwrapVault('ZZZZ2345EFGH', vault), null);
});
