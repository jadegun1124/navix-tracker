import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptFix,
  buildDayRecord,
  classifyMode,
  estimateSteps,
  formatDurationMs,
  needsDailyWipe,
  seoulDayKey,
  shouldKeepTrailPoint,
  tracksForSeoulDay,
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

test('daily wipe keeps today trail points and drops yesterday without a revoke payload', () => {
  const now = Date.UTC(2026, 9, 27, 16, 0);
  const kept = tracksForSeoulDay({
    self: [
      { lat: 37.1, lng: 127.1, at: Date.UTC(2026, 9, 27, 14, 0) },
      { lat: 37.2, lng: 127.2, at: Date.UTC(2026, 9, 27, 16, 30) },
    ],
  }, now);
  assert.equal(kept.self.length, 1);
  assert.equal(kept.self[0].lat, 37.2);
  assert.equal(Object.hasOwn(kept, 'sharing'), false);
});

test('trail sampler keeps a dwell sample and a real move, drops jitter', () => {
  const origin = { lat: 37.5, lng: 127, at: 1_000_000 };
  assert.equal(shouldKeepTrailPoint(origin, { lat: 37.50002, lng: 127, at: origin.at + 5_000 }), false);
  assert.equal(shouldKeepTrailPoint(origin, { lat: 37.50002, lng: 127, at: origin.at + 3 * 60 * 1000 }), true);
  assert.equal(shouldKeepTrailPoint(origin, { lat: 37.502, lng: 127, at: origin.at + 12_000 }), true);
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
