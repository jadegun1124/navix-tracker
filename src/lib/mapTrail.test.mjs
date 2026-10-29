import assert from 'node:assert/strict';
import test from 'node:test';
import { familyMapShowsTrail, mainOverviewTrails, recordsDayTrails } from './mapTrail.mjs';
import { liveTrailDrawable, trailSegmentDashed, WALK_STAY_LABEL_MS } from './tracking.mjs';

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

function offset(point, northM, eastM, at) {
  return {
    ...point,
    lat: point.lat + northM / 111_320,
    lng: point.lng + eastM / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    at,
  };
}

function walkCurve(now) {
  const origin = { lat: 37.55, lng: 127.07, at: now - 40_000, accuracyM: 10, speedMps: 1.3, staying: false };
  const points = [];
  for (let index = 0; index <= 16; index += 1) {
    const theta = (Math.PI / 2) * (index / 16);
    points.push({
      ...offset(origin, 36 * Math.sin(theta), 36 * (1 - Math.cos(theta)), origin.at + index * 2_500),
      accuracyM: 10,
      speedMps: 1.3,
      staying: false,
    });
  }
  return points;
}

test('stay state draws zero polylines on the main overview', () => {
  const now = Date.UTC(2026, 9, 28, 3, 46);
  const walked = walkCurve(now - WALK_STAY_LABEL_MS - 5_000);
  const end = walked[walked.length - 1];
  assert.equal(liveTrailDrawable(walked, end.at + 2 * 60 * 1000), true);
  const hidden = mainOverviewTrails({
    points: walked,
    pin: { lat: end.lat, lng: end.lng, at: end.at },
    moving: false,
    now: end.at + WALK_STAY_LABEL_MS,
  });
  assert.equal(hidden.length, 0);

  const hole = [
    { lat: 37.6366, lng: 127.0672, at: now - 89 * 60 * 1000, accuracyM: 18, speedMps: 0, staying: true },
    { lat: 37.6378, lng: 127.0684, at: now - 60_000, accuracyM: 18, speedMps: 0, staying: true },
  ];
  assert.equal(mainOverviewTrails({
    points: hole,
    pin: { lat: hole[1].lat, lng: hole[1].lng, at: hole[1].at },
    moving: false,
    now,
  }).length, 0);
  assert.equal(trailSegmentDashed(hole[0], hole[1]), true);
});

test('a moving overview keeps the dense curve, drops the dashed hole, and ends on the pin', () => {
  const now = Date.UTC(2026, 9, 28, 4, 0);
  const walked = walkCurve(now);
  const end = walked[walked.length - 1];
  const pin = offset(end, 12, -6, end.at);
  const hole = {
    ...offset(end, 0, 180, end.at + 80_000),
    accuracyM: 12,
    speedMps: 0,
    staying: true,
  };
  const lines = mainOverviewTrails({
    points: [...walked, hole],
    pin: { lat: pin.lat, lng: pin.lng, at: end.at },
    moving: false,
    now: hole.at + 2_000,
  });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length >= walked.length, `overview kept ${lines[0].length} of ${walked.length}`);
  assert.equal(lines[0][lines[0].length - 1].lat, pin.lat);
  assert.equal(lines[0][lines[0].length - 1].lng, pin.lng);
  assert.equal(lines[0].some((point) => point.lat === hole.lat && point.lng === hole.lng), false);
  for (let index = 1; index < lines[0].length; index += 1) {
    assert.equal(trailSegmentDashed(lines[0][index - 1], lines[0][index]), false);
  }
  const jumped = mainOverviewTrails({
    points: walked,
    pin: { ...offset(end, 0, 400, end.at + 6_000), speedMps: 0 },
    moving: false,
    now: end.at + 2_000,
  });
  assert.equal(jumped.length, 0);
});

test('records include archived journeys even when the live segment is gone', () => {
  const saved = recordsDayTrails({ journeys: [journey], livePoints: [{ lat: 37.51, lng: 127.01, at: 9 }], liveDrawable: false });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].length, 2);
  const both = recordsDayTrails({ journeys: [journey], livePoints: live, liveDrawable: true });
  assert.equal(both.length, 2);
  assert.equal(recordsDayTrails({ journeys: [], livePoints: live, liveDrawable: false }).length, 0);
});
