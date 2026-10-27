import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveManagedTarget } from './managedPlace.mjs';

function child(id, name, code) {
  return { id, name, role: 'child', inviteCode: code, lat: null, lng: null };
}

test('one invited member receives the live place even when the phone name differs', () => {
  const members = [{ id: 'self', name: '관리자', role: 'self' }, child('m-1', '딸', '48291')];
  const target = resolveManagedTarget(members, { code: '48291', name: '민지' });
  assert.equal(target.id, 'm-1');
  assert.equal(target.create, null);
});

test('exact roster name wins when several members share the invite code', () => {
  const members = [child('m-1', '딸', '48291'), child('m-2', '아들', '48291')];
  const target = resolveManagedTarget(members, { code: '48291', name: '아들' });
  assert.equal(target.id, 'm-2');
  assert.equal(target.create, null);
});

test('an unmatched extra phone still gets a pin instead of disappearing', () => {
  const members = [child('m-1', '딸', '48291'), child('m-2', '아들', '48291')];
  const target = resolveManagedTarget(members, { code: '48291', name: '민지' });
  assert.equal(target.id, 'remote:48291:민지');
  assert.equal(target.create.name, '민지');
  assert.equal(target.create.inviteCode, '48291');
  const again = resolveManagedTarget([...members, target.create], { code: '48291', name: '민지' });
  assert.equal(again.create, null);
  assert.equal(again.id, 'remote:48291:민지');
});
