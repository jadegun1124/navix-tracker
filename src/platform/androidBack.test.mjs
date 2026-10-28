import assert from 'node:assert/strict';
import test from 'node:test';
import { EXIT_CONFIRM_MS, EXIT_CONFIRM_TEXT, decideAndroidBack } from './androidBack.mjs';

test('one back from the root map asks before exit', () => {
  const first = decideAndroidBack(1_000, 0, false);
  assert.equal(first.action, 'toast');
  assert.equal(first.armedUntil, 1_000 + EXIT_CONFIRM_MS);
  assert.equal(EXIT_CONFIRM_TEXT, '한 번 더 누르면 앱이 종료됩니다');
  const again = decideAndroidBack(first.armedUntil - 1, first.armedUntil, false);
  assert.equal(again.action, 'exit');
  const late = decideAndroidBack(first.armedUntil + 1, first.armedUntil, false);
  assert.equal(late.action, 'toast');
});

test('an open sheet consumes back and does not exit', () => {
  const decision = decideAndroidBack(5_000, 9_000, true);
  assert.equal(decision.action, 'consumed');
  assert.equal(decision.armedUntil, 9_000);
});
