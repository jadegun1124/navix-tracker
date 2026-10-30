import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { absorbPlaceholderMembers } from './memberRoster.mjs';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const self = { id: 'self', name: '나', role: 'self' };

test('one invited seat and one publisher become that person once, under their own name', () => {
  const seat = { id: 'm-1', name: '엄마', role: 'child', inviteCode: '48291' };
  const publisher = { id: 'family:48291:local-ccc', name: '민지', role: 'admin-share', publisherId: 'local-ccc', lat: 37.5, lng: 127.1 };
  const { members, moves } = absorbPlaceholderMembers([self, seat, publisher]);
  assert.deepEqual(moves, [{ from: 'm-1', to: 'family:48291:local-ccc' }]);
  assert.equal(members.some((member) => member.id === 'm-1'), false);
  assert.equal(members.find((member) => member.publisherId === 'local-ccc').name, '민지');
  assert.equal(members.find((member) => member.publisherId === 'local-ccc').lat, 37.5);
  assert.equal(members.some((member) => member.id === 'self'), true);
});

test('a prior invite name picks the right seat and leaves the other', () => {
  const mom = { id: 'm-1', name: '엄마', role: 'child', inviteCode: '48291' };
  const son = { id: 'm-2', name: '아들', role: 'child', inviteCode: '48291' };
  const publisher = { id: 'family:48291:local-ccc', name: '민지', role: 'admin-share', publisherId: 'local-ccc' };
  const { members, moves } = absorbPlaceholderMembers([mom, son, publisher], { 'local-ccc': '엄마' });
  assert.deepEqual(moves, [{ from: 'm-1', to: 'family:48291:local-ccc' }]);
  assert.equal(members.some((member) => member.id === 'm-2'), true);
  assert.equal(members.find((member) => member.publisherId === 'local-ccc').name, '민지');
});

test('two seats and one publisher are not guessed apart', () => {
  const mom = { id: 'm-1', name: '엄마', role: 'child', inviteCode: '48291' };
  const son = { id: 'm-2', name: '아들', role: 'child', inviteCode: '48291' };
  const publisher = { id: 'family:48291:local-ccc', name: '민지', role: 'admin-share', publisherId: 'local-ccc' };
  const { members, moves } = absorbPlaceholderMembers([mom, son, publisher]);
  assert.deepEqual(moves, []);
  assert.equal(members.length, 3);
});

test('sharing consent is asked while inviting and joining, and the menu has no share row', () => {
  const screen = text('../components/family/FamilyMapScreen.tsx');
  const menu = screen.slice(screen.indexOf('function AdminMenu'), screen.indexOf('function chatTargetFor'));
  assert.equal(menu.includes('내 위치를 가족에게 공유'), false);
  assert.equal(menu.includes('위치 공유'), false);
  assert.match(screen, /위치 공유 허용/);
  assert.match(screen, /내 위치는 아직 가족에게 나가지 않습니다/);
  const session = text('../components/family/session.tsx');
  assert.match(session, /absorbPlaceholderMembers/);
  assert.match(session, /shareSelfWithFamily \? 'allowed' : 'accepted'/);
  assert.equal(screen.includes('내 위치를 가족에게 공유'), false);
});
