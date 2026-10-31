import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoFitRecord } from './recordMapFit.mjs';

const journey = { recordKey: 'self:2026-10-31:walk-1', fittedKey: '', userAdjusted: false, pointCount: 12 };

test('records fit the map once when a journey first opens', () => {
  assert.equal(shouldAutoFitRecord(journey), true);
  assert.equal(shouldAutoFitRecord({ ...journey, pointCount: 0 }), false);
  assert.equal(shouldAutoFitRecord({ ...journey, recordKey: '' }), false);
});

test('a later point refresh does not fit again', () => {
  const fitted = { ...journey, fittedKey: journey.recordKey, pointCount: 40 };
  assert.equal(shouldAutoFitRecord(fitted), false);
});

test('after the user zooms or pans, a new point list never fits', () => {
  assert.equal(shouldAutoFitRecord({ ...journey, userAdjusted: true }), false);
  assert.equal(shouldAutoFitRecord({
    recordKey: 'self:2026-10-31:walk-2',
    fittedKey: journey.recordKey,
    userAdjusted: true,
    pointCount: 20,
  }), false);
});

test('a different record fits again once the lock is cleared', () => {
  assert.equal(shouldAutoFitRecord({
    recordKey: 'khoon:2026-10-30:walk-9',
    fittedKey: journey.recordKey,
    userAdjusted: false,
    pointCount: 4,
  }), true);
});
