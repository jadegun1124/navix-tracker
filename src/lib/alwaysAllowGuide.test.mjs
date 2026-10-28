import assert from 'node:assert/strict';
import test from 'node:test';
import { ALWAYS_GUIDE_MENU_LABEL, alwaysAllowSteps, alwaysAllowWhy } from './alwaysAllowGuide.mjs';

test('always-allow guide names the closed-app reason and the OEM wording', () => {
  const why = alwaysAllowWhy();
  const steps = alwaysAllowSteps();
  assert.match(why, /앱을 닫아도/);
  assert.match(why, /화면을 끈 뒤/);
  assert.equal(steps.length, 6);
  assert.match(steps[0], /위치 액세스 권한/);
  assert.match(steps[1], /항상 허용/);
  assert.match(steps[1], /앱 사용 중에만 허용/);
  assert.match(steps[1], /항상 확인 또는 공유 시 허용/);
  assert.match(steps[1], /앱을 사용하지 않을 때도 허용/);
  assert.match(steps[2], /정확한 위치 사용/);
  assert.match(steps[2], /직접/);
  assert.match(steps[3], /위치/);
  assert.match(steps[4], /배터리 제한 없음/);
  assert.match(steps[5], /항상 허용 방법/);
  assert.equal(ALWAYS_GUIDE_MENU_LABEL, '항상 허용 방법');
});
