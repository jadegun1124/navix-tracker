import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GATE_BODY,
  GATE_BUTTON,
  GATE_OPEN_FAILED,
  GATE_TITLE,
  alwaysAllowGateCovers,
  alwaysAllowGateTarget,
  needsAlwaysAllowGate,
} from './alwaysAllowGate.mjs';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('the gate blocks denied, while-using, and approximate always', () => {
  assert.equal(needsAlwaysAllowGate({ native: false, location: 'denied', precise: false }), false);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'always', precise: true }), false);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'always', precise: null }), false);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'always', precise: false }), true);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'while-using', precise: true }), true);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'denied', precise: false }), true);
  assert.equal(needsAlwaysAllowGate({ native: true, location: 'unavailable', precise: null }), true);
});

test('login stays reachable and later stages are covered', () => {
  assert.equal(alwaysAllowGateCovers('splash'), false);
  assert.equal(alwaysAllowGateCovers('login'), false);
  for (const stage of ['survey', 'terms', 'permissions', 'phone', 'mode', 'map']) {
    assert.equal(alwaysAllowGateCovers(stage), true);
  }
});

test('Android 11+ opens location settings and Android 10 can show the background dialog', () => {
  assert.equal(alwaysAllowGateTarget({
    sdk: 30, foreground: false, background: false, precise: false, backgroundDialogAskable: true, fineDialogAskable: true,
  }), 'location-settings');
  assert.equal(alwaysAllowGateTarget({
    sdk: 33, foreground: true, background: true, precise: false, backgroundDialogAskable: false, fineDialogAskable: false,
  }), 'location-settings');
  assert.equal(alwaysAllowGateTarget({
    sdk: 29, foreground: false, background: false, precise: false, backgroundDialogAskable: true, fineDialogAskable: true,
  }), 'foreground-dialog');
  assert.equal(alwaysAllowGateTarget({
    sdk: 29, foreground: false, background: false, precise: false, backgroundDialogAskable: true, fineDialogAskable: false,
  }), 'location-settings');
  assert.equal(alwaysAllowGateTarget({
    sdk: 29, foreground: true, background: false, precise: true, backgroundDialogAskable: true, fineDialogAskable: false,
  }), 'background-dialog');
  assert.equal(alwaysAllowGateTarget({
    sdk: 29, foreground: true, background: false, precise: true, backgroundDialogAskable: false, fineDialogAskable: false,
  }), 'location-settings');
  assert.equal(alwaysAllowGateTarget({
    sdk: 29, foreground: true, background: true, precise: false, backgroundDialogAskable: true, fineDialogAskable: false,
  }), 'location-settings');
  assert.equal(alwaysAllowGateTarget({
    sdk: 28, foreground: false, background: false, precise: false, backgroundDialogAskable: false, fineDialogAskable: true,
  }), 'foreground-dialog');
  assert.equal(alwaysAllowGateTarget({
    sdk: 28, foreground: true, background: true, precise: true, backgroundDialogAskable: false, fineDialogAskable: false,
  }), 'ready');
});

test('gate copy is short and the button is not a dismiss control', () => {
  assert.equal(GATE_TITLE, '항상 허용이 필요합니다');
  assert.match(GATE_BODY, /항상 허용/);
  assert.match(GATE_BODY, /정확한 위치/);
  assert.equal(GATE_BUTTON, '설정에서 항상 허용 켜기');
  assert.match(GATE_OPEN_FAILED, /설정 > 앱 > Kinnex > 권한/);
  assert.ok(GATE_BODY.length < 120);
});

test('the modal is mounted after login, consumes back, and rechecks on resume', () => {
  const app = text('../components/family/FamilyApp.tsx');
  const gate = text('../components/family/AlwaysAllowGate.tsx');
  const exit = text('../platform/androidExit.ts');
  const onboarding = text('../components/family/Onboarding.tsx');
  assert.match(app, /alwaysAllowGateCovers/);
  assert.match(app, /<AlwaysAllowGate \/>/);
  assert.match(gate, /GATE_BUTTON/);
  assert.match(gate, /aria-modal="true"/);
  assert.match(gate, /__umapAlwaysAllowGate/);
  assert.match(gate, /visibilitychange/);
  assert.match(gate, /listenAppResume/);
  assert.equal(gate.includes('닫기'), false);
  assert.equal(gate.includes('onClose'), false);
  const back = exit.slice(exit.indexOf('export function handleAndroidBack'), exit.indexOf('let consumed'));
  assert.match(back, /__umapAlwaysAllowGate/);
  assert.match(onboarding, /카카오로 로그인/);
  assert.match(onboarding, /네이버로 로그인/);
  assert.match(onboarding, /복구 코드로 불러오기/);
  assert.match(onboarding, /새로 시작/);
});

test('native gate opens the Android 10 dialog and otherwise the location page', () => {
  const plugin = text('../../android/app/src/main/java/kr/co/umap/tracker/UmapLocationPlugin.java');
  const method = plugin.slice(plugin.indexOf('public void openAlwaysGate'), plugin.indexOf('private void resolveGate'));
  assert.match(method, /if \(background && precise\)/);
  assert.match(method, /VERSION_CODES\.Q && !background/);
  assert.match(method, /requestPermissionForAlias\("backgroundLocation"/);
  assert.match(method, /fineDialogAskable\(\)/);
  assert.match(method, /openAlwaysLocation\(call\)/);
  assert.ok(method.indexOf('backgroundLocation') < method.lastIndexOf('openAlwaysLocation'));
  const foreground = plugin.slice(plugin.indexOf('void gateForegroundCallback'), plugin.indexOf('void gateBackgroundCallback'));
  assert.match(foreground, /VERSION_CODES\.Q/);
  assert.match(foreground, /requestPermissionForAlias\("backgroundLocation"/);
  const access = plugin.slice(plugin.indexOf('public void locationAccess'), plugin.indexOf('public void overlayPermission'));
  assert.match(access, /result\.put\("precise", hasFine\(\)\)/);
  assert.match(plugin, /notifyListeners\("resume"/);
  const manifest = text('../../android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(manifest, /Android 10/);
});
