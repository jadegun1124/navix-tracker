import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TEST_ROLE_HINT,
  TEST_ROLE_TO_ADMIN,
  TEST_ROLE_TO_MANAGED,
  applyRole,
  isSelfEchoPlace,
  mapMembers,
  rosterMembers,
  testRoleFlip,
  testRoleLabel,
} from './testRole.mjs';

test('role flip keeps the same family members and room keys', () => {
  const guardians = [{ id: 'g-1', code: '48291', syncToken: 'writekeyvalue.readbyhashvalue', share: 'allowed' }];
  const child = { id: 'm-1', name: '딸', role: 'child', share: 'allowed', inviteCode: '10001', lat: 37.6, lng: 127.0 };
  const self = { id: 'self', name: '관리자', role: 'self', share: 'allowed', lat: 37.5, lng: 127.1 };
  const ghost = { id: 'family:10001:local-abc', name: '관리자', role: 'admin-share', publisherId: 'local-abc', share: 'allowed', lat: 37.5, lng: 127.1 };
  const members = [self, child, ghost];
  const admin = {
    mode: 'admin',
    stage: 'map',
    tab: 'map',
    permissions: { completed: true },
    inviteCode: '10001',
    syncWriteKey: 'aaaaaaaaaaaaaaaa',
    syncReadKey: 'bbbbbbbbbbbbbbbb',
    profile: { id: 'local-abc', name: '관리자' },
    guardians,
    members,
  };
  const managed = testRoleFlip(admin);
  assert.equal(managed.mode, 'managed');
  assert.equal(managed.stage, 'map');
  assert.equal(managed.inviteCode, '10001');
  assert.equal(managed.syncWriteKey, admin.syncWriteKey);
  assert.equal(managed.syncReadKey, admin.syncReadKey);
  assert.equal(managed.guardians, guardians);
  assert.deepEqual(managed.members.map((member) => member.id), ['self', 'm-1']);
  assert.equal(managed.members.some((member) => member.name === '관리자' && member.id !== 'self'), false);
  const back = testRoleFlip(managed);
  assert.equal(back.mode, 'admin');
  assert.deepEqual(back.members.map((member) => member.id), ['self', 'm-1']);
  assert.equal(testRoleLabel('managed'), TEST_ROLE_TO_ADMIN);
  assert.equal(testRoleLabel('admin'), TEST_ROLE_TO_MANAGED);
  assert.match(TEST_ROLE_HINT, /같은 가족 방/);
});

test('own family-audience place is not a second member, and the roster stays on both roles', () => {
  const profileId = 'local-abc';
  const inviteCode = '10001';
  assert.equal(isSelfEchoPlace({ code: inviteCode, audience: 'family', memberId: profileId, name: '관리자' }, profileId, inviteCode), true);
  assert.equal(isSelfEchoPlace({ code: '48291', audience: 'family', memberId: 'local-parent', name: '엄마' }, profileId, inviteCode), false);
  const members = [
    { id: 'self', name: '관리자', role: 'self', share: 'allowed', lat: 37.5, lng: 127.1 },
    { id: 'm-1', name: '딸', role: 'child', share: 'allowed', inviteCode, lat: 37.6, lng: 127.0 },
    { id: 'm-2', name: '아들', role: 'child', share: 'invited', inviteCode, lat: null, lng: null },
    { id: 'family:48291:local-parent', name: '엄마', role: 'admin-share', publisherId: 'local-parent', share: 'allowed', lat: 37.4, lng: 127.2 },
  ];
  const ids = (list) => list.map((member) => member.id);
  assert.deepEqual(ids(rosterMembers(members, profileId, inviteCode)), ['self', 'm-1', 'm-2', 'family:48291:local-parent']);
  assert.deepEqual(ids(mapMembers(members, profileId, inviteCode)), ['self', 'm-1', 'family:48291:local-parent']);
  const flipped = applyRole({ mode: 'admin', stage: 'map', tab: 'map', permissions: { completed: true }, inviteCode, profile: { id: profileId }, members }, 'managed');
  assert.equal(flipped.members.length, members.length);
  assert.equal(flipped.members[1].id, 'm-1');
});

test('test role switch leaves an unfinished onboarding stage alone', () => {
  const session = { mode: 'managed', stage: 'permissions', tab: 'history', permissions: { completed: false }, inviteCode: '10001', members: [{ id: 'self' }] };
  const next = testRoleFlip(session);
  assert.equal(next.mode, 'admin');
  assert.equal(next.stage, 'permissions');
  assert.equal(next.members[0].id, 'self');
  assert.equal(testRoleFlip({ mode: null, stage: 'mode', tab: 'map' }).mode, null);
});
