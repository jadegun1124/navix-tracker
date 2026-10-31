import assert from 'node:assert/strict';
import test from 'node:test';
import { familyMapShowsTrail, mainOverviewTrails, recordsDayTrails } from './mapTrail.mjs';
import { liveTrailDrawable, liveTrailPoints, settleTrailPoint, trailDrawParts, trailSegmentDashed, WALK_STAY_LABEL_MS } from './tracking.mjs';

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
  const jumpedPin = offset(end, 0, 400, end.at + 6_000);
  const jumped = mainOverviewTrails({
    points: walked,
    pin: { ...jumpedPin, speedMps: 0 },
    moving: false,
    now: end.at + 2_000,
  });
  assert.equal(jumped.length, 1);
  assert.ok(jumped[0].length >= walked.length);
  assert.equal(jumped[0][jumped[0].length - 1].lat, end.lat);
  assert.equal(jumped[0][jumped[0].length - 1].lng, end.lng);
  assert.equal(jumped[0].some((point) => point.lat === jumpedPin.lat && point.lng === jumpedPin.lng), false);
});

test('a gps hole hides the chord and keeps the solid trail until the next step', () => {
  const now = Date.UTC(2026, 9, 28, 4, 10);
  const walked = walkCurve(now);
  const end = walked[walked.length - 1];
  const hole = {
    ...offset(end, 0, 90, end.at + 25_000),
    accuracyM: 12,
    speedMps: 1.2,
    staying: false,
  };
  assert.equal(trailSegmentDashed(end, hole), true);
  const during = mainOverviewTrails({
    points: [...walked, hole],
    pin: { lat: hole.lat, lng: hole.lng, at: hole.at, speedMps: hole.speedMps },
    moving: null,
    now: hole.at + 1_000,
  });
  assert.equal(during.length, 1);
  assert.ok(during[0].length >= walked.length);
  assert.equal(during[0].some((point) => point.lat === hole.lat && point.lng === hole.lng), false);
  const resume = offset(hole, 0, 8, hole.at + 3_000);
  const after = mainOverviewTrails({
    points: [...walked, hole, { ...resume, accuracyM: 10, speedMps: 1.3, staying: false }],
    pin: { lat: resume.lat, lng: resume.lng, at: resume.at },
    moving: null,
    now: resume.at + 1_000,
  });
  assert.ok(after.length >= 1);
  assert.ok(after[0].length >= walked.length);
});

function eastOf(lat, lng, meters) {
  return lng + meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function segmentMeters(start, end) {
  const radius = 6_371_000;
  const p1 = (start.lat * Math.PI) / 180;
  const p2 = (end.lat * Math.PI) / 180;
  const dLat = p2 - p1;
  const dLng = ((end.lng - start.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Walk east. Accuracy cycles through 15–150m the way a phone alternates GPS and network.
 * Self fixes carry a walking speed. Family places are only lat, lng, time, and accuracy.
 */
function ingestMixedWalk(kind) {
  const accuracies = [15, 80, 120, 150];
  const lat = 37.6652;
  let lng = 127.0472;
  let points = [];
  let pin = null;
  const start = Date.UTC(2026, 9, 31, 3, 40, 0);
  const stepM = 12;
  const dt = 8_000;
  for (let index = 0; index < 40; index += 1) {
    const at = start + index * dt;
    const sample = {
      lat,
      lng,
      at,
      accuracyM: accuracies[index % accuracies.length],
      ...(kind === 'self' ? { speedMps: 1.3, staying: false } : {}),
    };
    const settled = settleTrailPoint(points, sample, at);
    points = settled.points;
    pin = {
      lat: Number.isFinite(settled.lat) ? settled.lat : sample.lat,
      lng: Number.isFinite(settled.lng) ? settled.lng : sample.lng,
      at,
      accuracyM: sample.accuracyM,
      ...(kind === 'self' ? { speedMps: 1.3 } : {}),
    };
    lng = eastOf(lat, lng, stepM);
  }
  const now = start + 39 * dt + 500;
  const live = liveTrailPoints(points, now);
  const lines = mainOverviewTrails({
    points: live,
    motionPoints: points,
    pin,
    moving: kind === 'self' ? true : null,
    now,
  });
  const solid = lines.flatMap((line) => trailDrawParts(line).filter((part) => !part.dashed && part.points.length >= 2));
  const span = solid.reduce((sum, part) => sum + segmentMeters(part.points[0], part.points[part.points.length - 1]), 0);
  return { points, live, lines, solid, span };
}

test('a mixed 15–150m walk draws a main-map line for self and for a family member', () => {
  for (const kind of ['self', 'family']) {
    const drawn = ingestMixedWalk(kind);
    assert.ok(drawn.live.length >= 2, `${kind} live vertices ${drawn.live.length}`);
    assert.ok(drawn.lines.length >= 1, `${kind} overview lines ${drawn.lines.length}`);
    assert.ok(drawn.solid.length >= 1, `${kind} solid parts ${drawn.solid.length}`);
    assert.ok(drawn.span >= 200, `${kind} solid span ${Math.round(drawn.span)}m`);
  }
  const self = ingestMixedWalk('self');
  assert.ok(self.points.filter((point) => point && !point.stayEnd).length >= 2);
});

test('records include archived journeys even when the live segment is gone', () => {
  const saved = recordsDayTrails({ journeys: [journey], livePoints: [{ lat: 37.51, lng: 127.01, at: 9 }], liveDrawable: false });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].length, 2);
  const both = recordsDayTrails({ journeys: [journey], livePoints: live, liveDrawable: true });
  assert.equal(both.length, 2);
  assert.equal(recordsDayTrails({ journeys: [], livePoints: live, liveDrawable: false }).length, 0);
});
