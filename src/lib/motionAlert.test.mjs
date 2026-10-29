import assert from 'node:assert/strict';
import test from 'node:test';
import { motionAlertCopy, motionNotifyNames, nextMotionAlert } from './motionAlert.mjs';
import { RIDE_STAY_LABEL_MS, WALK_STAY_LABEL_MS, lastTravelAt, lastTravelWasRide } from './tracking.mjs';

function offset(point, northM, eastM, at) {
  return {
    ...point,
    lat: point.lat + northM / 111_320,
    lng: point.lng + eastM / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    at,
  };
}

function walkFrom(origin, steps) {
  const points = [{ ...origin, speedMps: 1.2, staying: false }];
  for (let index = 1; index <= steps; index += 1) {
    points.push({
      ...offset(origin, 0, index * 3.2, origin.at + index * 2_500),
      accuracyM: 12,
      speedMps: 1.2,
      staying: false,
    });
  }
  return points;
}

test('motion copy is a short Korean shade line', () => {
  assert.equal(motionAlertCopy('하나', 'start'), '하나님이 움직이기 시작했어요');
  assert.equal(motionAlertCopy('하나', 'stop'), '하나님이 멈췄어요');
  assert.equal(motionAlertCopy('  ', 'start'), '가족님이 움직이기 시작했어요');
  assert.equal(motionAlertCopy('하나', 'other'), '');
});

test('notify names are the chosen family members and never self', () => {
  const members = [
    { id: 'self', name: '엄마' },
    { id: 'child-1', name: '하나' },
    { id: 'child-2', name: '아빠' },
  ];
  assert.deepEqual(motionNotifyNames(members, []), []);
  assert.deepEqual(motionNotifyNames(members, ['self', 'child-1']), ['하나']);
  assert.deepEqual(motionNotifyNames(members, ['child-2', 'child-1']), ['하나', '아빠']);
});

test('a walk start waits for a real step and a stop waits 45s', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.55, lng: 127.02, at: t, accuracyM: 12, speedMps: 0, staying: true };
  const jitter = { ...offset(origin, 4, 2, t + 12_000), accuracyM: 12, speedMps: 0, staying: true };
  const jittered = nextMotionAlert({ points: [origin, jitter], now: t + 12_000, phase: 'still' });
  assert.equal(jittered.event, null);
  assert.equal(jittered.phase, 'still');
  assert.equal(lastTravelAt([origin, jitter]), null);

  const quiet = nextMotionAlert({ points: [], now: t, phase: 'still' });
  assert.equal(quiet.event, null);

  const walk = walkFrom(origin, 6);
  const end = walk[walk.length - 1].at;
  assert.equal(lastTravelWasRide(walk), false);
  const adopted = nextMotionAlert({ points: walk, now: end + 2_000, phase: 'unknown' });
  assert.equal(adopted.event, null);
  assert.equal(adopted.phase, 'moving');

  const started = nextMotionAlert({ points: walk, now: end + 2_000, phase: 'still' });
  assert.deepEqual(started, { phase: 'moving', event: 'start' });
  const holding = nextMotionAlert({ points: walk, now: end + 30_000, phase: 'moving' });
  assert.equal(holding.event, null);
  assert.equal(holding.phase, 'moving');
  const stopped = nextMotionAlert({ points: walk, now: end + WALK_STAY_LABEL_MS, phase: 'moving' });
  assert.deepEqual(stopped, { phase: 'still', event: 'stop' });
  const again = nextMotionAlert({ points: walk, now: end + WALK_STAY_LABEL_MS + 10_000, phase: 'still' });
  assert.equal(again.event, null);
});

test('a ride stop waits the longer dwell, not the 45s walk window', () => {
  const t = 1_700_000_000_000;
  const origin = { lat: 37.55, lng: 127.02, at: t, accuracyM: 12, speedMps: 12, staying: false };
  const ride = [origin];
  for (let index = 1; index <= 4; index += 1) {
    ride.push({
      ...offset(origin, index * 40, 0, t + index * 2_500),
      accuracyM: 12,
      speedMps: 12,
      staying: false,
    });
  }
  const end = ride[ride.length - 1].at;
  assert.equal(lastTravelWasRide(ride), true);
  const early = nextMotionAlert({ points: ride, now: end + WALK_STAY_LABEL_MS, phase: 'moving' });
  assert.equal(early.event, null);
  assert.equal(early.phase, 'moving');
  const stopped = nextMotionAlert({ points: ride, now: end + RIDE_STAY_LABEL_MS, phase: 'moving' });
  assert.deepEqual(stopped, { phase: 'still', event: 'stop' });
  assert.equal(motionAlertCopy('엄마', stopped.event), '엄마님이 멈췄어요');
});
