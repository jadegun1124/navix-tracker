import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptFix,
  HISTORY_DAYS,
  buildDayRecord,
  classifyMode,
  estimateSteps,
  formatDurationMs,
  historyDayKeys,
  isWithinHistory,
  needsDailyWipe,
  oldestHistoryDay,
  seoulDayEndMs,
  seoulDayKey,
  shouldKeepTrailPoint,
  settleTrailPoint,
  tracksWithinHistory,
  trailDecision,
  visibleTrail,
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
  const drawn = visibleTrail([origin, spike, back, offset(origin, 70, 0, t + 45_000)]);
  assert.equal(drawn.length, 1);
  assert.equal(trailDecision(origin, offset(origin, 70, 0, t + 12_000)), 'snap');
  assert.equal(drawn[0].lat, origin.lat);
  assert.equal(drawn[0].lng, origin.lng);
  const settled = settleTrailPoint([origin, spike], back, back.at);
  assert.equal(settled.decision, 'snap');
  assert.equal(settled.lat, origin.lat);
  assert.equal(settled.lng, origin.lng);
  assert.equal(visibleTrail(settled.points).length, 1);
});

test('a move inside the accuracy radius is not a new vertex, and a poor fix is dropped', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.5, lng: 127, at: t, accuracyM: 12, speedMps: 1.2, staying: false };
  assert.equal(trailDecision(origin, { ...offset(origin, 15, 0, t + 10_000), speedMps: 1.2, staying: false }), 'snap');
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
