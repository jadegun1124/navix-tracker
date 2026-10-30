import assert from 'node:assert/strict';
import test from 'node:test';
import { memberFocusStep } from './memberFocus.mjs';

test('the first tap focuses a member and the second tap opens records', () => {
  let focus = { focusedId: null, recordsOpen: false };
  focus = memberFocusStep(focus, 'self');
  assert.deepEqual(focus, { focusedId: 'self', recordsOpen: false, action: 'focus' });
  focus = memberFocusStep(focus, 'self');
  assert.deepEqual(focus, { focusedId: 'self', recordsOpen: true, action: 'records' });
  focus = memberFocusStep(focus, 'self');
  assert.equal(focus.action, 'keep');
  assert.equal(focus.recordsOpen, true);
});

test('a different member takes the focus and an empty map clears it', () => {
  let focus = memberFocusStep({ focusedId: 'mom', recordsOpen: true }, 'dad');
  assert.deepEqual(focus, { focusedId: 'dad', recordsOpen: false, action: 'focus' });
  focus = memberFocusStep(focus, 'dad');
  assert.equal(focus.action, 'records');
  focus = memberFocusStep(focus, null);
  assert.deepEqual(focus, { focusedId: null, recordsOpen: false, action: 'clear' });
  focus = memberFocusStep(focus, 'mom');
  assert.equal(focus.action, 'focus');
  assert.equal(focus.recordsOpen, false);
});
