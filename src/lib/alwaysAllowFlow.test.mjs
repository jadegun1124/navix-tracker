import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { alwaysAllowSteps } from './alwaysAllowGuide.mjs';
import {
  COACH_NEXT,
  OVERLAY_ALLOW,
  OVERLAY_ASK_BODY,
  OVERLAY_ASK_TITLE,
  OVERLAY_BANNER,
  OVERLAY_SKIP,
  PRECISE_HINT,
  WHILE_USING_LEAD,
  WHILE_USING_OPTION,
  WHILE_USING_TITLE,
  nextAlwaysAllowAction,
} from './alwaysAllowFlow.mjs';

test('always-allow flow asks for while-in-use, then overlay, then the location screen', () => {
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'need', overlay: 'unknown' }), 'request-foreground');
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'denied', overlay: 'granted' }), 'stop');
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'always', overlay: 'unknown' }), 'done');
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'while-using', overlay: 'unknown' }), 'ask-overlay');
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'while-using', overlay: 'granted' }), 'settings-with-overlay');
  assert.equal(nextAlwaysAllowAction({ native: true, foreground: 'while-using', overlay: 'denied' }), 'settings-fallback-guide');
  assert.equal(nextAlwaysAllowAction({ native: false, foreground: 'need', overlay: 'unknown' }), 'browser');
});

test('while-using coach and overlay copy stay short', () => {
  assert.equal(WHILE_USING_TITLE, '"앱을 사용하는 동안 허용"으로 설정');
  assert.equal(WHILE_USING_OPTION, '앱 사용 중에만 허용');
  assert.equal(COACH_NEXT, '다음');
  assert.ok(WHILE_USING_LEAD.length < 24);
  assert.ok(OVERLAY_ASK_BODY.length < 40);
  assert.equal(OVERLAY_ASK_TITLE, '다른 앱 위에 표시');
  assert.equal(OVERLAY_ALLOW, '표시 허용');
  assert.equal(OVERLAY_SKIP, '건너뛰기');
  assert.equal(OVERLAY_BANNER, 'Umap 항상 허용으로 설정');
  assert.equal(PRECISE_HINT, '정확한 위치 사용도 켜기');
  assert.deepEqual(alwaysAllowSteps(), [
    '「항상 허용」 고르기',
    '「정확한 위치 사용」 켜기',
    '배터리 제한 없음',
  ]);
});

test('native overlay uses the same banner and does not grant background location', () => {
  const overlay = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/AlwaysAllowOverlay.java', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/UmapLocationPlugin.java', import.meta.url), 'utf8');
  assert.match(overlay, /Umap 항상 허용으로 설정/);
  assert.match(overlay, /정확한 위치 사용도 켜기/);
  assert.match(overlay, /TYPE_APPLICATION_OVERLAY/);
  assert.match(overlay, /canDrawOverlays/);
  assert.match(overlay, /ACCESS_BACKGROUND_LOCATION/);
  assert.equal(overlay.includes('requestPermissions'), false);
  assert.match(manifest, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(plugin, /ACTION_MANAGE_OVERLAY_PERMISSION/);
  assert.match(plugin, /AlwaysAllowOverlay\.show/);
  assert.match(plugin, /AlwaysAllowOverlay\.hide/);
  const open = plugin.slice(plugin.indexOf('private boolean openAlwaysSettings'), plugin.indexOf('private void noteOpened'));
  assert.equal(open.includes('AlwaysAllowOverlay'), false);
  assert.equal(open.includes('APPLICATION_DETAILS_SETTINGS'), false);
  const radio = plugin.slice(plugin.indexOf('private boolean openLocationRadio'), plugin.indexOf('private boolean openAppPermissions'));
  assert.ok(radio.indexOf('ManagePermissionsActivity') < radio.indexOf('com.google.android.permissioncontroller'));
});
