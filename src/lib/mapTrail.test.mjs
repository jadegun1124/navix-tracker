import assert from 'node:assert/strict';
import test from 'node:test';
import { familyMapShowsTrail, recordsDayTrails } from './mapTrail.mjs';

const self = { id: 'self', share: 'allowed', role: 'self' };
const peer = { id: 'admin', share: 'allowed', role: 'admin-share' };
const pending = { id: 'm2', share: 'pending', role: 'child' };
const journey = {
  points: [
    { lat: 37.5, lng: 127, at: 1 },
    { lat: 37.51, lng: 127.01, at: 2 },
  ],
};
const live = [
  { lat: 37.52, lng: 127.02, at: 3 },
  { lat: 37.53, lng: 127.03, at: 4 },
];

test('family overview draws a live trail only while that segment is still open', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: self, liveDrawable: true }), true);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: false, member: peer, liveDrawable: true }), true);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: self, liveDrawable: false }), false);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: null, liveDrawable: true }), false);
});

test('closing records keeps a trail that is still live and hides one that was archived', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: true, showTrail: true, member: self, liveDrawable: true }), true);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: true, showTrail: true, member: self, liveDrawable: false }), false);
});

test('records view still draws that person trail', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: true, detailOpen: false, showTrail: true, member: self }), true);
  assert.equal(familyMapShowsTrail({ viewingRecords: true, detailOpen: false, showTrail: true, member: peer }), true);
  assert.equal(familyMapShowsTrail({ viewingRecords: true, detailOpen: false, showTrail: false, member: self }), false);
  assert.equal(familyMapShowsTrail({ viewingRecords: true, detailOpen: false, showTrail: true, member: pending }), false);
});

test('journey replay still draws while records are open', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: true, detailOpen: true, showTrail: false, member: self }), true);
});

test('records include archived journeys even when the live segment is gone', () => {
  const saved = recordsDayTrails({ journeys: [journey], livePoints: [{ lat: 37.51, lng: 127.01, at: 9 }], liveDrawable: false });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].length, 2);
  const both = recordsDayTrails({ journeys: [journey], livePoints: live, liveDrawable: true });
  assert.equal(both.length, 2);
  assert.equal(recordsDayTrails({ journeys: [], livePoints: live, liveDrawable: false }).length, 0);
});
