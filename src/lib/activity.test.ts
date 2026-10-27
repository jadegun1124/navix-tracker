import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STOP_HOLD_MS,
  classifySpeedMps,
  formatDistance,
  formatDuration,
  formatRange,
  freshnessLabel,
  isFreshFix,
  judgeTrackFix,
  latestTodaySegment,
  modeLabel,
  placeUpdateKind,
  pointsOnSeoulDay,
  resolveSteps,
  seoulDayKey,
  simplifyPath,
  stepActivity,
  type ActivitySnapshot,
  type FixSample,
} from './activity.ts';

const LAT = 37.55;

function north(meters: number, from = LAT): number {
  return from + meters / 111_320;
}

function fix(lat: number, at: number, extra: Partial<FixSample> = {}): FixSample {
  return { lat, lng: 127.0, at, accuracyM: 8, speedMps: null, ...extra };
}

function run(samples: FixSample[], stepsAt: number[] = []) {
  let snapshot: ActivitySnapshot | null = null;
  const segments = [];
  const visits = [];
  samples.forEach((sample, index) => {
    const result = stepActivity(snapshot, sample, {
      memberId: 'self',
      deviceSteps: stepsAt[index] ?? null,
      label: '우리 집',
    });
    snapshot = result.snapshot;
    if (result.segment) segments.push(result.segment);
    if (result.visit) visits.push(result.visit);
  });
  return { snapshot, segments, visits };
}

test('seoul day boundary and daily trail filter', () => {
  const before = Date.parse('2026-10-27T14:50:00Z');
  const after = Date.parse('2026-10-27T15:10:00Z');
  assert.equal(seoulDayKey(before), '2026-10-27');
  assert.equal(seoulDayKey(after), '2026-10-28');
  const kept = pointsOnSeoulDay(
    [
      { lat: 1, lng: 1, at: before },
      { lat: 2, lng: 2, at: after },
    ],
    after,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].lat, 2);
  assert.equal(pointsOnSeoulDay(undefined, after).length, 0);
});

test('same coordinate with a newer stamp still refreshes', () => {
  assert.equal(
    placeUpdateKind(
      { lat: 37.5, lng: 127, updatedAt: 1_000, battery: 80, moveMode: 'still' },
      { lat: 37.5, lng: 127, at: 1_000 + 86_400_000, battery: 70, mode: 'still' },
    ),
    'touch',
  );
  assert.equal(
    placeUpdateKind(
      { lat: 37.5, lng: 127, updatedAt: 5_000, battery: 10, moveMode: 'walk' },
      { lat: 37.5, lng: 127, at: 4_000, battery: 10, mode: 'walk' },
    ),
    'ignore',
  );
  assert.equal(
    placeUpdateKind(
      { lat: null, lng: null, updatedAt: 0, battery: null, moveMode: null },
      { lat: 37.5, lng: 127, at: 10, battery: null, mode: null },
    ),
    'move',
  );
});

test('stale cache and impossible jumps are rejected, small jitter stays put', () => {
  const now = 1_700_000_000_000;
  assert.equal(isFreshFix(now - 5_000, now), true);
  assert.equal(isFreshFix(now - 60_000, now), false);
  const previous = { lat: LAT, lng: 127, at: now - 5_000 };
  const jump = judgeTrackFix(previous, fix(north(50_000), now, { accuracyM: 5 }));
  assert.equal(jump.ok, false);
  assert.equal(jump.reason, 'jump');
  const jitter = judgeTrackFix(previous, fix(north(4), now));
  assert.equal(jitter.ok, true);
  assert.equal(jitter.heartbeat, true);
  assert.equal(jitter.lat, previous.lat);
});

test('a stay then a walk records one segment, a visit, and estimated steps', () => {
  const start = Date.parse('2026-10-27T01:00:00Z');
  const samples = [fix(LAT, start), fix(LAT, start + STOP_HOLD_MS + 1000)];
  for (let hop = 1; hop <= 4; hop += 1) {
    samples.push(fix(north(60 * hop), start + STOP_HOLD_MS + hop * 40_000));
  }
  const arrived = samples[samples.length - 1].at;
  samples.push(fix(north(60 * 4), arrived + STOP_HOLD_MS + 1000));
  const { segments, visits } = run(samples);
  assert.equal(visits[0].label, '우리 집');
  assert.equal(visits[0].endedAt, null);
  assert.equal(visits[1].id, visits[0].id);
  assert.notEqual(visits[1].endedAt, null);
  assert.equal(visits[2].endedAt, null);
  assert.notEqual(visits[2].id, visits[0].id);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].mode, 'walk');
  assert.ok(segments[0].distanceM >= 200 && segments[0].distanceM <= 260);
  assert.equal(segments[0].stepsSource, 'estimate');
  assert.ok((segments[0].steps ?? 0) > 200);
  assert.match(formatRange(segments[0].startAt, segments[0].endAt), /분/);
});

test('device pedometer wins when the delta is sane, plane has no steps', () => {
  const walk = resolveSteps('walk', 240, 1300, 1000);
  assert.deepEqual(walk, { steps: 300, stepsSource: 'device' });
  const wild = resolveSteps('walk', 240, 50_000, 0);
  assert.equal(wild.stepsSource, 'estimate');
  assert.equal(resolveSteps('car', 1000, 100, 0).steps, null);

  const start = 1_700_000_000_000;
  const samples = [fix(LAT, start)];
  for (let hop = 1; hop <= 3; hop += 1) {
    samples.push(fix(north(2_000 * hop), start + hop * 10_000, { accuracyM: 12 }));
  }
  samples.push(fix(north(6_000), samples[samples.length - 1].at + STOP_HOLD_MS + 1000, { accuracyM: 12 }));
  const { segments } = run(samples);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].mode, 'plane');
  assert.equal(segments[0].steps, null);
  assert.equal(classifySpeedMps(3), 'bike');
  assert.equal(classifySpeedMps(15), 'car');
  assert.equal(modeLabel('car'), '차량');
});

test('formats and path simplify stay stable', () => {
  assert.equal(formatDuration(53 * 60 * 1000), '53분');
  assert.equal(formatDistance(13_200), '13.2 km');
  assert.equal(formatDistance(210), '210 m');
  assert.equal(freshnessLabel(Date.now() - 10_000, Date.now()), '지금');
  const path = Array.from({ length: 10 }, (_, index) => ({ lat: index, lng: index }));
  const simple = simplifyPath(path, 8);
  assert.equal(simple.length, 8);
  assert.equal(simple[0].lat, 0);
  assert.equal(simple[simple.length - 1].lat, 9);
  assert.equal(latestTodaySegment([], 'self', Date.now()), null);
});
