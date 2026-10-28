import assert from 'node:assert/strict';
import test from 'node:test';
import { familyPinId, moveKeyed } from './sharedIdentity.mjs';

test('a family pin keeps the member id when the display name changes', () => {
  assert.equal(familyPinId('48291', { name: '딸' }), 'family:48291:딸');
  assert.equal(familyPinId('48291', { name: '민지', memberId: 'local-abc' }), 'family:48291:local-abc');
  assert.equal(familyPinId('48291', { name: '하나', memberId: 'local-abc' }), 'family:48291:local-abc');
});

test('history follows the pin id across a rename', () => {
  const tracks = { 'family:48291:딸': [{ lat: 37, lng: 127 }] };
  const moved = moveKeyed(tracks, 'family:48291:딸', 'family:48291:local-abc');
  assert.deepEqual(moved['family:48291:local-abc'], [{ lat: 37, lng: 127 }]);
  assert.equal(moved['family:48291:딸'], undefined);
  assert.equal(moveKeyed(moved, 'family:48291:local-abc', 'family:48291:local-abc'), moved);
});
