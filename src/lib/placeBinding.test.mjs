import assert from 'node:assert/strict';
import test from 'node:test';
import { bindPlaceToMember, familyPlacePinId, placeIsSelf, placeMemberId, placeStorageKey } from './placeBinding.mjs';

function child(id, name, publisherId) {
  return { id, name, role: 'child', publisherId, lat: 37.6, lng: 127.07 };
}

const viewer = { id: 'self', name: '엄마', role: 'self', publisherId: 'local-mom', lat: 37.64, lng: 127.08 };
const leftover = child('m-1', '엄마', 'local-gone');

test('a place without a member id cannot bind to anyone', () => {
  assert.equal(placeMemberId({ name: '엄마' }), '');
  assert.equal(placeStorageKey({ code: '48291', name: '엄마', audience: 'family' }), null);
  assert.equal(familyPlacePinId('48291', { name: '엄마' }), '');
  assert.equal(bindPlaceToMember([viewer, leftover], { code: '48291', name: '엄마', lat: 37.64, lng: 127.08 }), null);
});

test('storage keys only by member id, never by display name', () => {
  assert.equal(
    placeStorageKey({ code: '48291', name: '민지', memberId: 'local-aaa', audience: 'family' }),
    '48291:family:id:local-aaa',
  );
  assert.equal(
    placeStorageKey({ code: '48291', name: '민지', memberId: 'local-aaa' }),
    '48291:admin:id:local-aaa',
  );
  assert.notEqual(
    placeStorageKey({ code: '48291', name: '민지', memberId: 'local-aaa', audience: 'family' }),
    placeStorageKey({ code: '48291', name: '민지', memberId: 'local-bbb', audience: 'family' }),
  );
});

test('the viewer self row never receives another member id', () => {
  const selfPlace = { code: '48291', name: '엄마', memberId: 'local-mom', lat: 37.64, lng: 127.08 };
  assert.equal(placeIsSelf(selfPlace, 'local-mom'), true);
  assert.equal(bindPlaceToMember([viewer, leftover], selfPlace), null);
  assert.equal(bindPlaceToMember([viewer], selfPlace)?.id, undefined);
});

test('an uninstalled member with the same name does not take the viewer coordinates', () => {
  const viewerPlace = { code: '48291', name: '엄마', memberId: 'local-mom', lat: 37.64, lng: 127.08 };
  const bound = bindPlaceToMember([viewer, leftover], viewerPlace);
  assert.equal(bound, null);
  assert.equal(leftover.lat, 37.6);
  assert.equal(leftover.lng, 127.07);
});

test('a leftover roster row only updates when the publisher id matches', () => {
  const ghostPlace = { code: '48291', name: '엄마', memberId: 'local-gone', lat: 37.55, lng: 127.01 };
  const bound = bindPlaceToMember([viewer, leftover], ghostPlace);
  assert.equal(bound?.id, 'm-1');
  const stranger = { code: '48291', name: '엄마', memberId: 'local-other', lat: 37.64, lng: 127.08 };
  assert.equal(bindPlaceToMember([viewer, leftover], stranger), null);
});

test('one invited child is not a sink for an unmatched place', () => {
  const only = [viewer, child('m-1', '딸', 'local-daughter')];
  assert.equal(bindPlaceToMember(only, { code: '48291', name: '민지', memberId: 'local-extra' }), null);
  assert.equal(bindPlaceToMember(only, { code: '48291', name: '딸' }), null);
});

test('a family pin id stays on the member id after a rename', () => {
  assert.equal(familyPlacePinId('48291', { name: '민지', memberId: 'local-abc' }), 'family:48291:local-abc');
  assert.equal(familyPlacePinId('48291', { name: '하나', memberId: 'local-abc' }), 'family:48291:local-abc');
});
