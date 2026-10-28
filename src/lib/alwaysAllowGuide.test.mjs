import assert from 'node:assert/strict';
import test from 'node:test';
import { ALWAYS_GUIDE_MENU_LABEL, alwaysAllowSteps } from './alwaysAllowGuide.mjs';

test('always-allow guide is three short steps', () => {
  const steps = alwaysAllowSteps();
  assert.deepEqual(steps, [
    '「항상 허용」 고르기',
    '「정확한 위치 사용」 켜기',
    '배터리 제한 없음',
  ]);
  assert.equal(ALWAYS_GUIDE_MENU_LABEL, '항상 허용 방법');
  const joined = steps.join('\n');
  assert.doesNotMatch(joined, /앱 사용 중에만 허용/);
  assert.doesNotMatch(joined, /항상 확인/);
  assert.doesNotMatch(joined, /앱을 사용하지 않을 때도/);
  assert.ok(joined.length < 80);
});
