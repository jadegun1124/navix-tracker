import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptFix,
  HISTORY_DAYS,
  buildDayRecord,
  classifyMode,
  estimateSteps,
  formatDurationMs,
  formatJourneyDistance,
  formatJourneyWhen,
  historyDayKeys,
  isWithinHistory,
  needsDailyWipe,
  oldestHistoryDay,
  seoulDayEndMs,
  seoulDayKey,
  shouldKeepTrailPoint,
  displayCoordinate,
  liveCoordinate,
  settleTrailPoint,
  tracksWithinHistory,
  trailDecision,
  formatFixAge,
  visibleTrail,
  trailDrawParts,
  trailSegmentDashed,
  JOURNEY_STAY_MS,
  splitClosedJourneys,
  liveTrailPoints,
  previewOpenJourney,
  journeysWithinHistory,
  mergeJourneyLists,
  labelJourneyPlace,
} from './tracking.mjs';

test('seoul day rolls at midnight KST, not UTC', () => {
  const beforeMidnight = Date.UTC(2026, 9, 27, 14, 59);
  const midnight = Date.UTC(2026, 9, 27, 15, 0);
  assert.equal(seoulDayKey(beforeMidnight), '2026-10-27');
  assert.equal(seoulDayKey(midnight), '2026-10-28');
  assert.equal(needsDailyWipe('2026-10-27', beforeMidnight), false);
  assert.equal(needsDailyWipe('2026-10-27', midnight), true);
  assert.equal(needsDailyWipe(undefined, midnight), true);
});

test('history keeps today and 30 days ago, and drops the day before that', () => {
  const now = Date.UTC(2026, 9, 27, 16, 0);
  assert.equal(seoulDayKey(now), '2026-10-28');
  const oldest = oldestHistoryDay(now);
  assert.equal(oldest, '2026-09-28');
  assert.equal(historyDayKeys(now)[0], '2026-10-28');
  assert.equal(historyDayKeys(now).at(-1), oldest);
  assert.equal(historyDayKeys(now).length, HISTORY_DAYS + 1);
  const yesterday = Date.UTC(2026, 9, 26, 16, 0);
  const tooOld = Date.UTC(2026, 8, 27, 14, 0);
  assert.equal(isWithinHistory(yesterday, now), true);
  assert.equal(isWithinHistory(tooOld, now), false);
  const kept = tracksWithinHistory({
    self: [
      { lat: 37.0, lng: 127.0, at: tooOld },
      { lat: 37.1, lng: 127.1, at: yesterday },
      { lat: 37.2, lng: 127.2, at: now },
    ],
  }, now);
  assert.equal(kept.self.length, 2);
  assert.equal(kept.self[0].lat, 37.1);
  assert.equal(kept.self[1].lat, 37.2);
  assert.equal(seoulDayKey(seoulDayEndMs('2026-10-27')), '2026-10-27');
});

function offset(point, northM, eastM, at) {
  return {
    ...point,
    lat: point.lat + northM / 111_320,
    lng: point.lng + eastM / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    at,
  };
}

test('trail sampler keeps a real move and does not draw a stay wiggle', () => {
  const origin = { lat: 37.5, lng: 127, at: 1_000_000, accuracyM: 12 };
  assert.equal(shouldKeepTrailPoint(origin, { lat: 37.50002, lng: 127, at: origin.at + 5_000, accuracyM: 12 }), false);
  assert.equal(shouldKeepTrailPoint(origin, { lat: 37.50002, lng: 127, at: origin.at + 3 * 60 * 1000, accuracyM: 12 }), false);
  assert.equal(shouldKeepTrailPoint(origin, { ...offset(origin, 220, 0, origin.at + 12_000), speedMps: 1.4, staying: false }), true);
});

test('a still fix with ±12m accuracy does not draw a multipath triangle', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 12, speedMps: 0, staying: true };
  const spike = offset(origin, 32, 28, t + 15_000);
  const back = offset(origin, 6, -22, t + 30_000);
  const drawn = visibleTrail([origin, spike, back]);
  assert.equal(drawn.length, 1);
  assert.equal(trailDecision(origin, offset(origin, 70, 0, t + 12_000)), 'snap');
  assert.equal(drawn[0].lat, origin.lat);
  assert.equal(drawn[0].lng, origin.lng);
  const settled = settleTrailPoint([origin, spike], back, back.at);
  assert.equal(settled.decision, 'snap');
  assert.equal(settled.lat, origin.lat);
  assert.equal(settled.lng, origin.lng);
  assert.equal(visibleTrail(settled.points).length, 1);
  const walked = visibleTrail([origin, spike, back, offset(origin, 70, 0, t + 45_000)]);
  assert.equal(walked.length, 2);
  assert.ok((walked[1].lat - origin.lat) * 111_320 > 60);
});

test('a still phone ignores one fast leap and keeps a sustained walk', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 15, speedMps: 0, staying: true };
  assert.equal(trailDecision(origin, { ...offset(origin, 110, 0, t + 20_000), speedMps: 0, staying: true, accuracyM: 15 }), 'snap');
  assert.equal(trailDecision(origin, { ...offset(origin, 110, 0, t + 80_000), speedMps: 1.2, staying: true, accuracyM: 15 }), 'keep');
});

test('live pin holds courtyard jitter and follows a relocation the walk filter used to freeze', () => {
  const t = 1_700_000_000_000;
  const hagye = { lat: 37.6365, lng: 127.0678, at: t, accuracyM: 17, speedMps: 0, staying: true };
  const courtyard = { ...offset(hagye, 28, 16, t + 12_000), accuracyM: 17, speedMps: 0, staying: true };
  assert.equal(trailDecision(hagye, courtyard), 'snap');
  const held = settleTrailPoint([hagye], courtyard, courtyard.at);
  assert.equal(held.lat, hagye.lat);
  assert.equal(held.lng, hagye.lng);
  assert.equal(displayCoordinate([hagye], courtyard).lat, hagye.lat);
  assert.equal(visibleTrail([hagye, courtyard]).length, 1);

  const blockLeap = { ...offset(hagye, 100, 0, t + 12_000), accuracyM: 17, speedMps: 0, staying: true };
  assert.equal(trailDecision(hagye, blockLeap), 'snap');
  const leapt = settleTrailPoint([hagye], blockLeap, blockLeap.at);
  assert.equal(leapt.decision, 'snap');
  assert.equal(leapt.lat, blockLeap.lat);
  assert.equal(leapt.lng, blockLeap.lng);
  assert.equal(displayCoordinate([hagye], blockLeap).lat, blockLeap.lat);
  assert.equal(visibleTrail([hagye, blockLeap]).length, 1);

  const shortHop = { ...offset(hagye, 1000, 80, t + 15_000), accuracyM: 17, speedMps: 0, staying: true };
  assert.equal(trailDecision(hagye, shortHop), 'keep');
  const moved = settleTrailPoint([hagye], shortHop, shortHop.at);
  assert.equal(moved.decision, 'keep');
  assert.equal(moved.lat, shortHop.lat);
  assert.equal(moved.lng, shortHop.lng);
  assert.equal(displayCoordinate([hagye], shortHop).lat, shortHop.lat);
  assert.equal(displayCoordinate([hagye], shortHop).lng, shortHop.lng);
  assert.ok(visibleTrail(moved.points).length >= 2);

  const slowBus = { ...offset(hagye, 1000, 0, t + 90_000), accuracyM: 12, speedMps: null, staying: true };
  const driven = settleTrailPoint([hagye], slowBus, slowBus.at);
  assert.equal(driven.decision, 'keep');
  assert.equal(driven.lat, slowBus.lat);
  assert.equal(liveCoordinate(hagye, slowBus).lat, slowBus.lat);

  const wiggle = { ...offset(shortHop, 18, -12, shortHop.at + 10_000), accuracyM: 17, speedMps: 0, staying: true };
  const stayed = settleTrailPoint(moved.points, wiggle, wiggle.at);
  assert.equal(stayed.lat, shortHop.lat);
  assert.equal(stayed.lng, shortHop.lng);
  assert.equal(displayCoordinate(moved.points, wiggle).lat, shortHop.lat);
});

test('admin, managed, and remote trails drop courtyard spikes and keep a block corner', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.6362, lng: 127.0675, at: t, accuracyM: 15 };
  const sawtooth = (withMotion) => {
    const points = [];
    for (let index = 0; index <= 8; index += 1) {
      const point = offset(origin, index % 2 === 0 ? 0 : 72, index * 55, t + index * 12_000);
      point.accuracyM = 15;
      if (withMotion) {
        point.speedMps = 1.3;
        point.staying = false;
      }
      points.push(point);
    }
    return points;
  };
  const eastOf = (point) => (point.lng - origin.lng) * (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const northOf = (point) => (point.lat - origin.lat) * 111_320;
  for (const points of [sawtooth(true), sawtooth(false)]) {
    const drawn = visibleTrail(points);
    assert.ok(drawn.length >= 2);
    assert.ok(drawn.length < points.length);
    assert.ok(eastOf(drawn[drawn.length - 1]) > 350);
    for (const point of drawn) assert.ok(Math.abs(northOf(point)) < 28);
    let recorded = [points[0]];
    for (const point of points.slice(1)) recorded = settleTrailPoint(recorded, point, point.at).points;
    for (const point of visibleTrail(recorded)) assert.ok(Math.abs(northOf(point)) < 28);
  }

  const shaped = visibleTrail([
    { ...origin, accuracyM: 12, speedMps: 1.3, staying: false },
    { ...offset(origin, 180, 0, t + 160_000), accuracyM: 12, speedMps: 1.3, staying: false },
    { ...offset(origin, 180, 180, t + 300_000), accuracyM: 12, speedMps: 1.3, staying: false },
    { ...offset(origin, 180, 260, t + 360_000), accuracyM: 12, speedMps: 1.3, staying: false },
  ]);
  assert.ok(shaped.some((point) => northOf(point) > 140 && eastOf(point) < 40));

  const opposite = [
    [0, 0], [70, 40], [2, 90], [-68, 130], [0, 190], [75, 230], [0, 280],
  ].map(([north, east], index) => ({
    ...offset(origin, north, east, t + index * 20_000),
    accuracyM: 15,
    speedMps: 1.3,
    staying: false,
  }));
  const flattened = visibleTrail(opposite);
  assert.ok(eastOf(flattened[flattened.length - 1]) > 240);
  for (const point of flattened) assert.ok(Math.abs(northOf(point)) < 20);

  const drive = [0, 1, 2, 3, 4, 5].map((index) => ({
    ...offset(origin, 0, index * 120, t + index * 8_000),
    accuracyM: 8,
    speedMps: 12,
    staying: false,
  }));
  const driven = visibleTrail(drive);
  assert.equal(driven[0].lat, drive[0].lat);
  assert.ok(eastOf(driven[driven.length - 1]) > 500);
  for (const point of driven) assert.ok(Math.abs(northOf(point)) < 12);
});

test('a short step inside the walking gate is not a vertex, and a poor fix is dropped', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 12, speedMps: 1.2, staying: false };
  assert.equal(trailDecision(origin, { ...offset(origin, 1.6, 0, t + 2_500), speedMps: 1.2, staying: false }), 'snap');
  assert.equal(trailDecision(origin, { ...offset(origin, 3, 0, t + 2_500), speedMps: 1.2, staying: false, accuracyM: 19 }), 'keep');
  assert.equal(trailDecision(origin, { ...offset(origin, 3, 0, t + 2_500), speedMps: 0, staying: false, accuracyM: 12 }), 'keep');
  assert.equal(trailDecision(origin, { ...offset(origin, 15, 0, t + 10_000), speedMps: 1.2, staying: false }), 'keep');
  assert.equal(trailDecision(origin, { ...offset(origin, 70, 0, t + 10_000), accuracyM: 55, speedMps: 1.4, staying: false }), 'drop');
  const stayed = settleTrailPoint([origin], { ...origin, at: t + 4 * 60 * 1000 }, t + 4 * 60 * 1000);
  assert.equal(visibleTrail(stayed.points).length, 1);
  assert.equal(stayed.points.length, 2);
  assert.equal(stayed.points[1].lat, origin.lat);
  assert.equal(stayed.points[1].stayEnd, true);
});

test('stale cached fix is rejected and a fresh precise fix is kept', () => {
  const now = 1_800_000_000_000;
  const stale = acceptFix(null, { lat: 37.5, lng: 127, accuracy: 12, at: now - 31_000 }, { precise: true, now });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale');
  const fresh = acceptFix(null, { lat: 37.5, lng: 127, accuracy: 12, at: now - 1_000, speedMps: 1.2 }, { precise: true, now });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.fix.accuracy, 12);
  assert.equal(fresh.fix.speedMps, 1.2);
  const coarse = acceptFix(null, { lat: 37.5, lng: 127, accuracy: 300, at: now }, { precise: true, now });
  assert.equal(coarse.ok, false);
  assert.equal(coarse.reason, 'accuracy');
  const laterPoor = acceptFix({ lat: 37.5, lng: 127, at: now - 5_000 }, { lat: 37.5004, lng: 127, accuracy: 50, at: now }, { precise: true, now });
  assert.equal(laterPoor.ok, false);
  assert.equal(laterPoor.reason, 'accuracy');
});

test('a single teleport is rejected and a later real move is not', () => {
  const now = 1_800_000_000_000;
  const previous = { lat: 37.5, lng: 127, at: now - 10_000 };
  const jump = acceptFix(previous, { lat: 37.55, lng: 127, accuracy: 10, at: now }, { precise: true, now });
  assert.equal(jump.ok, false);
  assert.equal(jump.reason, 'jump');
  const moved = acceptFix(
    { lat: 37.5, lng: 127, at: now - 30 * 60 * 1000 },
    { lat: 37.55, lng: 127, accuracy: 10, at: now - 1_000 },
    { precise: true, now },
  );
  assert.equal(moved.ok, true);
});

test('a block walk keeps midpoints, stay jitter does not grow, a thin spur drops, and 1km moves the pin', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.6362, lng: 127.0675, at: t, accuracyM: 12, speedMps: 0, staying: true };
  const eastOf = (point) => (point.lng - origin.lng) * (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const northOf = (point) => (point.lat - origin.lat) * 111_320;
  const step = (north, east, at, speed = 0, staying = true) => ({
    ...offset(origin, north, east, at),
    accuracyM: 12,
    speedMps: speed,
    staying,
  });

  let recorded = [step(0, 0, t)];
  for (let index = 1; index <= 40; index += 1) {
    const north = index <= 20 ? index * 4.2 : 20 * 4.2;
    const east = index <= 20 ? 0 : (index - 20) * 4.2;
    const point = step(north, east, t + index * 3_000);
    recorded = settleTrailPoint(recorded, point, point.at).points;
  }
  const drawn = visibleTrail(recorded);
  assert.ok(drawn.length >= 4, `walk midpoints kept, got ${drawn.length}`);
  assert.ok(drawn.some((point) => northOf(point) > 60 && eastOf(point) < 20));
  assert.ok(eastOf(drawn[drawn.length - 1]) > 60);
  assert.ok(northOf(drawn[drawn.length - 1]) > 60);
  assert.ok(drawn.length < recorded.length);

  const paced = [];
  for (let index = 0; index <= 6; index += 1) paced.push(step(index * 18, 0, t + index * 14_000, 1.3, false));
  for (let index = 1; index <= 6; index += 1) paced.push(step(6 * 18, index * 18, t + (6 + index) * 14_000, 1.3, false));
  const pacedDrawn = visibleTrail(paced);
  assert.ok(pacedDrawn.length >= 3, `straight legs stay joined at the corner, got ${pacedDrawn.length}`);
  assert.ok(pacedDrawn.some((point) => northOf(point) > 70 && eastOf(point) < 25));

  const jitter = [step(0, 0, t)];
  for (let index = 1; index <= 10; index += 1) {
    jitter.push(step(index % 2 === 0 ? 4 : -3, (index % 3) - 1, t + index * 5_000));
  }
  assert.equal(visibleTrail(jitter).length, 1);
  let stayed = [jitter[0]];
  for (const point of jitter.slice(1)) stayed = settleTrailPoint(stayed, point, point.at).points;
  assert.equal(visibleTrail(stayed).length, 1);

  const tip = step(48, 6, t + 12_000, 1.2, false);
  const back = step(2, 4, t + 24_000, 1.2, false);
  const onward = [origin, tip, back];
  for (let index = 1; index <= 5; index += 1) onward.push(step(2, 4 + index * 20, t + 24_000 + index * 12_000, 1.3, false));
  for (const point of visibleTrail(onward)) assert.ok(northOf(point) < 22, `spur remained at north ${northOf(point)}`);

  const far = step(1000, 40, t + 20_000, 0, true);
  const moved = settleTrailPoint([origin], far, far.at);
  assert.equal(moved.decision, 'keep');
  assert.equal(moved.lat, far.lat);
  assert.equal(moved.lng, far.lng);
  assert.ok(visibleTrail(moved.points).length >= 2);
});

test('a 5s walk along a bend stays off the straight chord and a continuous run is solid', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.6312, lng: 127.0734, at: t, accuracyM: 15, speedMps: 1.2, staying: false };
  const radius = 40;
  const arcSteps = 11;
  const points = [];
  for (let index = 0; index <= arcSteps; index += 1) {
    const theta = (Math.PI / 2) * (index / arcSteps);
    const north = radius * Math.sin(theta);
    const east = radius * (1 - Math.cos(theta));
    points.push({
      ...offset(origin, north, east, t + index * 5_000),
      accuracyM: 15,
      speedMps: 1.2,
      staying: false,
    });
  }
  let recorded = [points[0]];
  for (const point of points.slice(1)) recorded = settleTrailPoint(recorded, point, point.at).points;
  const northOf = (point) => (point.lat - origin.lat) * 111_320;
  const eastOf = (point) => (point.lng - origin.lng) * (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const drawn = visibleTrail(recorded);
  assert.ok(drawn.length >= 4, `bend vertices ${drawn.length}`);
  assert.ok(drawn.some((point) => {
    const north = northOf(point);
    const east = eastOf(point);
    return north > 18 && east > 5 && north > east + 8;
  }));
  const parts = trailDrawParts(recorded);
  assert.equal(parts.some((part) => part.dashed), false);
  assert.ok(parts.some((part) => !part.dashed && part.points.length >= 2));
  assert.equal(trailSegmentDashed(points[0], points[1]), false);
  const hole = {
    ...offset(origin, 0, 90, points[points.length - 1].at + 40_000),
    accuracyM: 15,
    speedMps: 1.2,
    staying: false,
  };
  const withHole = settleTrailPoint(recorded, hole, hole.at).points;
  assert.equal(trailDrawParts(withHole).some((part) => part.dashed), true);
});

test('stay multipath does not zigzag and a fix outside the stay bubble still moves the pin', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.631, lng: 127.074, at: t, accuracyM: 16, speedMps: 0, staying: true };
  const hops = [[0, 0], [22, 16], [-6, 20], [18, -14], [4, 8], [-12, 18]];
  const points = hops.map(([north, east], index) => ({
    ...offset(origin, north, east, t + index * 6_000),
    accuracyM: 16,
    speedMps: 0,
    staying: true,
  }));
  assert.equal(visibleTrail(points).length, 1);
  let stayed = [points[0]];
  for (const point of points.slice(1)) {
    const settled = settleTrailPoint(stayed, point, point.at);
    const north = Math.abs((settled.lat - origin.lat) * 111_320);
    const east = Math.abs((settled.lng - origin.lng) * (111_320 * Math.cos((origin.lat * Math.PI) / 180)));
    assert.ok(north < 12 && east < 12, `pin drifted ${north.toFixed(1)},${east.toFixed(1)}`);
    stayed = settled.points;
  }
  assert.equal(visibleTrail(stayed).length, 1);
  const bogus = { ...offset(origin, 30, 10, t + 3_000), accuracyM: 16, speedMps: 1.4, staying: true };
  assert.equal(trailDecision(origin, bogus), 'snap');
  assert.equal(liveCoordinate(origin, bogus).lat, origin.lat);
  const left = { ...offset(origin, 70, 10, t + 8_000), accuracyM: 16, speedMps: 0, staying: true };
  assert.equal(trailDecision(origin, left), 'snap');
  const pin = liveCoordinate(origin, left);
  assert.equal(pin.lat, left.lat);
  assert.equal(pin.lng, left.lng);
});

test('fix age says when the pin last updated', () => {
  const now = 1_800_000_000_000;
  assert.equal(formatFixAge(now - 10_000, now), '방금 업데이트');
  assert.equal(formatFixAge(now - 44_000, now), '방금 업데이트');
  assert.equal(formatFixAge(now - 45_000, now), '1분 전 업데이트');
  assert.equal(formatFixAge(now - 3 * 60_000, now), '3분 전 업데이트');
  assert.equal(formatFixAge(now - 3 * 60_000 - 20_000, now), '3분 전 업데이트');
  assert.equal(formatFixAge(now - 2 * 60 * 60_000, now), '2시간 전 업데이트');
});

test('mode thresholds and step estimate', () => {
  assert.equal(classifyMode(4, 800, 12 * 60 * 1000), 'walk');
  assert.equal(classifyMode(15, 3_000, 12 * 60 * 1000), 'bike');
  assert.equal(classifyMode(60, 10_000, 10 * 60 * 1000), 'vehicle');
  assert.equal(classifyMode(360, 30_000, 5 * 60 * 1000), 'plane');
  assert.equal(classifyMode(360, 500, 5_000), 'vehicle');
  assert.equal(classifyMode(1, 20, 10 * 60 * 1000), 'walk');
  assert.equal(estimateSteps(750), 1000);
  assert.equal(estimateSteps(0), 0);
  assert.equal(formatDurationMs(90 * 60 * 1000), '1시간 30분');
});

test('stop-to-stop segment records walk time and estimated steps', () => {
  const start = Date.UTC(2026, 9, 26, 1, 0, 0);
  const points = [
    { lat: 37.5, lng: 127, at: start },
    { lat: 37.50005, lng: 127, at: start + 3 * 60 * 1000 },
    { lat: 37.50008, lng: 127, at: start + 6 * 60 * 1000 },
    { lat: 37.51, lng: 127, at: start + 16 * 60 * 1000 },
    { lat: 37.52, lng: 127, at: start + 26 * 60 * 1000 },
    { lat: 37.52002, lng: 127.0001, at: start + 32 * 60 * 1000 },
  ];
  const record = buildDayRecord(points, start + 32 * 60 * 1000);
  assert.equal(record.stops.length, 2);
  assert.equal(record.stops[0].leftAt, start + 6 * 60 * 1000);
  assert.equal(record.stops[1].leftAt, null);
  assert.equal(record.segments.length, 1);
  assert.equal(record.segments[0].mode, 'walk');
  assert.equal(record.segments[0].stepsEstimated, true);
  assert.equal(record.segments[0].durationMs, 20 * 60 * 1000);
  assert.ok(record.segments[0].steps > 2000);
  assert.equal(record.segments[0].open, false);
});

function staySamples(point, from, until, stepMs = 60_000) {
  const points = [];
  for (let at = from; at <= until; at += stepMs) {
    points.push({ ...point, at, accuracyM: 12, speedMps: 0, staying: true });
  }
  return points;
}

test('a 2.5s walk keeps a curve and a 7 minute stay archives it', () => {
  const t = Date.UTC(2026, 9, 27, 23, 34);
  const origin = { lat: 37.55, lng: 127.07, at: t, accuracyM: 12, speedMps: 1.2, staying: false };
  const radius = 28;
  const steps = 16;
  const curve = [];
  for (let index = 0; index <= steps; index += 1) {
    const theta = (Math.PI / 2) * (index / steps);
    curve.push({
      ...offset(origin, radius * Math.sin(theta), radius * (1 - Math.cos(theta)), t + index * 2_500),
      accuracyM: 12,
      speedMps: 1.2,
      staying: false,
    });
  }
  const drawn = visibleTrail(curve);
  assert.ok(drawn.length >= 5, `dense bend vertices ${drawn.length}`);
  const parts = trailDrawParts(curve);
  assert.equal(parts.some((part) => part.dashed), false);
  assert.ok(parts.some((part) => !part.dashed && part.points.length > drawn.length));

  const depart = t;
  const walk = [];
  for (let index = 0; index <= 24; index += 1) {
    walk.push({
      ...offset(origin, index * 10, 0, depart + index * 12_000),
      accuracyM: 12,
      speedMps: 1.3,
      staying: false,
    });
  }
  const arrive = walk[walk.length - 1].at;
  const early = [...walk, ...staySamples(walk[walk.length - 1], arrive, arrive + 4 * 60 * 1000, 60_000)];
  const tooSoon = splitClosedJourneys(early, arrive + 4 * 60 * 1000);
  assert.equal(tooSoon.journeys.length, 0);
  assert.equal(liveTrailPoints(early, arrive + 4 * 60 * 1000).length, early.length);

  const closed = [...walk, ...staySamples(walk[walk.length - 1], arrive, arrive + JOURNEY_STAY_MS, 60_000)];
  const split = splitClosedJourneys(closed, arrive + JOURNEY_STAY_MS);
  assert.equal(split.journeys.length, 1);
  assert.ok(split.journeys[0].distanceM >= 200);
  assert.ok(split.journeys[0].distanceM < 400);
  assert.equal(split.journeys[0].endedAt, arrive);
  assert.equal(formatJourneyWhen(split.journeys[0].startedAt, split.journeys[0].endedAt), '08:34–08:38');
  assert.equal(formatJourneyDistance(13_600), '13.6km');
  const live = liveTrailPoints(closed, arrive + JOURNEY_STAY_MS);
  assert.ok(live.length < closed.length);
  assert.ok(live.every((point) => Math.abs((point.lat - walk[walk.length - 1].lat) * 111_320) < 30));
  assert.equal(previewOpenJourney(live, arrive + JOURNEY_STAY_MS), null);

  const again = splitClosedJourneys([...closed, ...staySamples(walk[walk.length - 1], arrive + 60_000, arrive + JOURNEY_STAY_MS, 60_000)], arrive + JOURNEY_STAY_MS + 30_000);
  assert.equal(again.journeys.length, 1);
  assert.equal(again.journeys[0].id, split.journeys[0].id);

  const stale = staySamples(origin, t, t + 3 * 60 * 1000, 3 * 60 * 1000);
  assert.equal(splitClosedJourneys(stale, t + JOURNEY_STAY_MS).journeys.length, 0);

  const fresh = staySamples(origin, t, t + 6 * 60 * 1000, 3 * 60 * 1000);
  const wall = splitClosedJourneys([...walk, ...fresh.map((point) => ({ ...point, at: point.at - t + arrive }))], arrive + JOURNEY_STAY_MS);
  assert.equal(wall.journeys.length, 1);
});

test('a short hop after a stay does not become a journey card', () => {
  const t = Date.UTC(2026, 9, 27, 23, 0);
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 10, speedMps: 0, staying: true };
  const home = staySamples(origin, t, t + 8 * 60 * 1000, 60_000);
  const hop = offset(origin, 70, 0, t + 10 * 60 * 1000);
  const away = { ...hop, accuracyM: 10, speedMps: 1.2, staying: false };
  const backStay = staySamples(away, away.at, away.at + JOURNEY_STAY_MS, 60_000);
  const split = splitClosedJourneys([...home, away, ...backStay], backStay[backStay.length - 1].at);
  assert.equal(split.journeys.length, 0);
  assert.ok(split.remaining.every((point) => Math.abs((point.lat - away.lat) * 111_320) < 20));
  const labeled = labelJourneyPlace({ lat: origin.lat, lng: origin.lng, label: null }, [{ lat: origin.lat, lng: origin.lng, label: '우리 집', radiusM: 80 }]);
  assert.equal(labeled.label, '우리 집');
});

test('a new walk after archive stays on the live line and old journeys expire', () => {
  const t = Date.UTC(2026, 9, 27, 23, 10);
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 10 };
  const walk = [];
  for (let index = 0; index <= 20; index += 1) {
    walk.push({ ...offset(origin, 0, index * 12, t + index * 15_000), accuracyM: 10, speedMps: 1.4, staying: false });
  }
  const arrive = walk[walk.length - 1].at;
  const parked = staySamples(walk[walk.length - 1], arrive, arrive + JOURNEY_STAY_MS, 60_000);
  const next = [];
  for (let index = 1; index <= 12; index += 1) {
    next.push({
      ...offset(walk[walk.length - 1], 0, index * 15, parked[parked.length - 1].at + index * 12_000),
      accuracyM: 10,
      speedMps: 1.4,
      staying: false,
    });
  }
  const now = next[next.length - 1].at;
  const split = splitClosedJourneys([...walk, ...parked, ...next], now);
  assert.equal(split.journeys.length, 1);
  assert.ok(split.journeys[0].distanceM >= 200);
  assert.ok(split.remaining.some((point) => point.at === next[next.length - 1].at));
  assert.equal(split.remaining.some((point) => point.at === walk[0].at), false);
  const open = previewOpenJourney([...walk, ...parked, ...next], now);
  assert.ok(open);
  assert.equal(open.open, true);
  assert.ok(open.distanceM >= 100);
  assert.ok(open.startedAt > arrive);

  const kept = journeysWithinHistory({
    self: [
      split.journeys[0],
      { ...split.journeys[0], id: 'old', endedAt: Date.UTC(2026, 7, 1, 0, 0), startedAt: Date.UTC(2026, 7, 1, 0, 0) },
    ],
  }, now);
  assert.equal(kept.self.length, 1);
  assert.equal(kept.self[0].id, split.journeys[0].id);
});

test('같은 이동을 조금 다르게 다시 쌓아도 카드는 하나다', () => {
  const start = Date.UTC(2026, 9, 28, 3, 49, 0);
  const end = start + 5 * 60_000;
  const points = [
    { lat: 37.63635, lng: 127.07041, at: start },
    { lat: 37.63916, lng: 127.07074, at: end },
  ];
  const first = {
    id: `${start}:${end}:37.6364:127.0704`,
    startedAt: start,
    endedAt: end,
    distanceM: 392,
    points,
    start: { lat: 37.63635, lng: 127.07041, label: null },
    end: { lat: 37.63916, lng: 127.07074, label: null },
  };
  const second = {
    id: `${start + 15_000}:${end + 20_000}:37.6363:127.0704`,
    startedAt: start + 15_000,
    endedAt: end + 20_000,
    distanceM: 398,
    points,
    start: { lat: 37.6364, lng: 127.0705, label: '서울특별시 노원구 중계동' },
    end: { lat: 37.6392, lng: 127.0708, label: null },
  };
  const merged = mergeJourneyLists([first], [second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].distanceM, 398);
  assert.equal(merged[0].start.label, '서울특별시 노원구 중계동');
  const later = {
    id: 'later-trip',
    startedAt: start + 60 * 60_000,
    endedAt: start + 70 * 60_000,
    distanceM: 800,
    points,
    start: { lat: 37.65, lng: 127.08, label: null },
    end: { lat: 37.66, lng: 127.09, label: null },
  };
  assert.equal(mergeJourneyLists(merged, [later]).length, 2);
});
