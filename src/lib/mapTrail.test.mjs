import assert from 'node:assert/strict';
import test from 'node:test';
import { familyMapShowsTrail } from './mapTrail.mjs';

const self = { id: 'self', share: 'allowed', role: 'self' };
const peer = { id: 'admin', share: 'allowed', role: 'admin-share' };
const pending = { id: 'm2', share: 'pending', role: 'child' };

test('family overview does not draw a live trail', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: self }), false);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: peer }), false);
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: false, showTrail: true, member: null }), false);
});

test('closing records hides the trail even when the path toggle stays on', () => {
  assert.equal(familyMapShowsTrail({ viewingRecords: false, detailOpen: true, showTrail: true, member: self }), false);
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
