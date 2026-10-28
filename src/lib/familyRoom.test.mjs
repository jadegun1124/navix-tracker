import assert from 'node:assert/strict';
import test from 'node:test';
import { countOtherSharers, hiddenKeysForMember, placeHidden, shouldDeleteCreatedRoom } from './familyRoom.mjs';

test('delete wipes the room this phone created, and leave wipes it only when nobody else remains', () => {
  assert.equal(shouldDeleteCreatedRoom(3, 'delete'), true);
  assert.equal(shouldDeleteCreatedRoom(0, 'delete'), true);
  assert.equal(shouldDeleteCreatedRoom(null, 'delete'), true);
  assert.equal(shouldDeleteCreatedRoom(0, 'leave'), true);
  assert.equal(shouldDeleteCreatedRoom(2, 'leave'), false);
  assert.equal(shouldDeleteCreatedRoom(null, 'leave'), false);
});

test('other sharers ignore this phone', () => {
  const places = [
    { memberId: 'local-aaa', sharing: true, lat: 37.5, lng: 127 },
    { memberId: 'local-bbb', sharing: true, lat: 37.6, lng: 127 },
    { memberId: 'local-ccc', sharing: false, lat: null, lng: null },
  ];
  assert.equal(countOtherSharers(places, 'local-aaa'), 1);
  assert.equal(countOtherSharers(null, 'local-aaa'), null);
});

test('a removed family card stays hidden when the same place syncs back', () => {
  const member = { id: 'family:48291:local-bbb', publisherId: 'local-bbb', name: '하나', inviteCode: '48291' };
  const hidden = hiddenKeysForMember(member);
  assert.equal(placeHidden('48291', { code: '48291', name: '하나', memberId: 'local-bbb', sharing: true }, hidden), true);
  assert.equal(placeHidden('48291', { code: '48291', name: '둘', memberId: 'local-ccc', sharing: true }, hidden), false);
  const named = hiddenKeysForMember({ id: 'm-1', name: '엄마' });
  assert.equal(placeHidden('48291', { code: '48291', name: '엄마', sharing: true }, named), true);
});
