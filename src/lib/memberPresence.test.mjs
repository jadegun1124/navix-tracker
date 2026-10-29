import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEMBER_DISCONNECTED_MS,
  MEMBER_STALE_MS,
  cleanDepartedIds,
  memberIsStale,
  memberPresence,
  memberPresenceLabel,
  relativePlaceAge,
} from './memberPresence.mjs';

test('a live member keeps the usual status and a stopped phone keeps last location', () => {
  const now = Date.UTC(2026, 9, 29, 0, 0);
  const live = { id: 'm-1', role: 'child', updatedAt: now - 2 * 60_000 };
  const stale = { id: 'm-1', role: 'child', updatedAt: now - 3 * 60 * 60_000 };
  assert.equal(memberPresence(live, now).kind, 'live');
  assert.equal(memberPresenceLabel(memberPresence(live, now)), '');
  assert.equal(memberPresence(stale, now).kind, 'stale');
  assert.equal(memberPresenceLabel(memberPresence(stale, now)), '마지막 위치 · 3시간 전');
  assert.equal(memberIsStale(memberPresence(stale, now)), true);
  assert.equal(relativePlaceAge(now - MEMBER_STALE_MS, now), '10분 전');
});

test('after seven days the card is 연결 끊김', () => {
  const now = Date.UTC(2026, 9, 29, 0, 0);
  const gone = { id: 'm-1', role: 'child', updatedAt: now - MEMBER_DISCONNECTED_MS };
  assert.equal(memberPresence(gone, now).kind, 'disconnected');
  assert.equal(memberPresenceLabel(memberPresence(gone, now)), '연결 끊김');
  assert.equal(memberPresence({ id: 'self', role: 'self', updatedAt: now - MEMBER_DISCONNECTED_MS }, now).kind, 'live');
});

test('departed ids are member ids only', () => {
  assert.deepEqual(cleanDepartedIds(['local-aaa', 'local-aaa', '엄마', '', 'local-bbb']), ['local-aaa', 'local-bbb']);
});
