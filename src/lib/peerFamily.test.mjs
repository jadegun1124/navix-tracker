import assert from 'node:assert/strict';
import test from 'node:test';
import { isSelfEchoPlace, mergePeerSessions, mergedShareSelf, rosterMembers } from './peerFamily.mjs';

test('admin and managed snapshots become one family without a second 관리자', () => {
  const profile = { id: 'local-abc', name: '엄마' };
  const child = { id: 'm-1', name: '딸', role: 'child', share: 'allowed', inviteCode: '10001', lat: 37.6, lng: 127, updatedAt: 20 };
  const ghost = { id: 'family:10001:local-abc', name: '관리자', role: 'admin-share', publisherId: 'local-abc', share: 'allowed', lat: 37.5, lng: 127.1, updatedAt: 30 };
  const namedGhost = { id: 'family:10001:엄마', name: '엄마', role: 'admin-share', share: 'allowed', updatedAt: 30 };
  const admin = {
    savedAt: 10,
    mode: 'admin',
    stage: 'map',
    profile,
    inviteCode: '10001',
    syncWriteKey: 'aaaaaaaaaaaaaaaa',
    syncReadKey: 'bbbbbbbbbbbbbbbb',
    permissions: { completed: true },
    shareSelfWithFamily: true,
    members: [
      { id: 'self', name: '엄마', role: 'self', share: 'allowed', updatedAt: 5 },
      child,
      ghost,
      namedGhost,
    ],
    guardians: [],
  };
  const managed = {
    savedAt: 40,
    mode: 'managed',
    stage: 'map',
    profile,
    inviteCode: '10001',
    syncWriteKey: 'aaaaaaaaaaaaaaaa',
    syncReadKey: 'bbbbbbbbbbbbbbbb',
    permissions: { completed: true },
    members: [
      { id: 'self', name: '엄마', role: 'self', share: 'allowed', updatedAt: 50 },
      ghost,
    ],
    guardians: [{ id: 'g-1', code: '48291', share: 'allowed', syncToken: 'writekeyvalueaaaa.readhashvaluebbb' }],
  };
  const merged = mergePeerSessions([admin, managed]);
  assert.equal(merged.mode, null);
  assert.equal(merged.stage, 'map');
  assert.equal(merged.inviteCode, '10001');
  assert.equal(merged.syncWriteKey, 'aaaaaaaaaaaaaaaa');
  assert.equal(merged.syncReadKey, 'bbbbbbbbbbbbbbbb');
  assert.equal(merged.shareSelfWithFamily, true);
  assert.deepEqual(merged.members.map((member) => member.id), ['self', 'm-1']);
  assert.equal(merged.members.filter((member) => member.name === '관리자').length, 0);
  assert.equal(merged.guardians[0].code, '48291');
  assert.equal(rosterMembers(merged.members, profile.id, merged.inviteCode, profile.name).some((member) => member.id === 'm-1'), true);
  assert.equal(isSelfEchoPlace({ code: '10001', audience: 'family', memberId: 'local-abc', name: '엄마' }, 'local-abc', '10001'), true);
  assert.equal(isSelfEchoPlace({ code: '10001', audience: 'family', memberId: 'local-other', name: '아빠' }, 'local-abc', '10001'), false);
});

test('a newer explicit decline stays off when an older copy was sharing', () => {
  const older = { savedAt: 1, shareSelfWithFamily: true, guardians: [{ code: '10001', share: 'allowed' }] };
  const newer = { savedAt: 2, shareSelfWithFamily: false, guardians: [] };
  assert.equal(mergedShareSelf([older, newer], []), false);
  assert.equal(mergePeerSessions([
    { ...older, stage: 'map', profile: { id: 'local-abc', name: '나' }, inviteCode: '10001', members: [], permissions: { completed: true } },
    { ...newer, stage: 'map', profile: { id: 'local-abc', name: '나' }, inviteCode: '10001', members: [], permissions: { completed: true } },
  ]).shareSelfWithFamily, false);
});

test('a newer copy of the same person replaces the older row', () => {
  const older = { savedAt: 1, mode: 'admin', stage: 'map', profile: { id: 'local-abc', name: '엄마' }, inviteCode: '10001', members: [{ id: 'm-1', name: '딸', role: 'child', updatedAt: 1 }], permissions: { completed: true } };
  const newer = { savedAt: 2, mode: 'managed', stage: 'map', profile: { id: 'local-abc', name: '엄마' }, inviteCode: '10001', members: [{ id: 'm-1', name: '딸', role: 'child', updatedAt: 9, place: '강북구 수유동' }], permissions: { completed: true } };
  const merged = mergePeerSessions([older, newer]);
  assert.equal(merged.members.length, 1);
  assert.equal(merged.members[0].place, '강북구 수유동');
});
