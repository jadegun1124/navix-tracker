import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { APP_DETAILS_ACTION, BATTERY_POPUP_ACTION, LOCATION_PERMISSION_ACTION, LOCATION_PERMISSION_GROUP, LOCATION_PERMISSION_LIST_ACTION, alwaysAllowAction, alwaysAllowScreens, batteryAction, keepEntryPrompt, motionAction, notificationAction, whileUsingAction } from './systemSettings.mjs';

test('android permission buttons open system prompts instead of skipping', () => {
  assert.equal(notificationAction(true), 'post-notifications');
  assert.equal(whileUsingAction(true), 'foreground-location');
  assert.equal(alwaysAllowAction(true), 'location-settings');
  assert.equal(motionAction(true, false), 'activity-recognition');
  assert.equal(batteryAction(true), 'ignore-battery-optimizations');
});

test('always-allow opens the location radio, then the app permission list, then app info', () => {
  assert.equal(LOCATION_PERMISSION_ACTION, 'android.intent.action.MANAGE_APP_PERMISSION');
  assert.equal(LOCATION_PERMISSION_GROUP, 'android.permission-group.LOCATION');
  assert.equal(LOCATION_PERMISSION_LIST_ACTION, 'android.intent.action.MANAGE_APP_PERMISSIONS');
  assert.equal(APP_DETAILS_ACTION, 'android.settings.APPLICATION_DETAILS_SETTINGS');
  assert.deepEqual(alwaysAllowScreens(), ['location-radio', 'app-permissions', 'app-details']);
  assert.equal(BATTERY_POPUP_ACTION, 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
  assert.equal(BATTERY_POPUP_ACTION.includes('IGNORE_BATTERY_OPTIMIZATION_SETTINGS'), false);
  const plugin = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/UmapLocationPlugin.java', import.meta.url), 'utf8');
  const open = plugin.slice(plugin.indexOf('private boolean openAlwaysSettings'), plugin.indexOf('private void noteOpened'));
  assert.ok(open.indexOf('openLocationRadio') < open.indexOf('openAppPermissions'));
  assert.ok(open.indexOf('openAppPermissions') < open.indexOf('openAppDetails'));
  const radio = plugin.slice(plugin.indexOf('private boolean openLocationRadio'), plugin.indexOf('private boolean openAppPermissions'));
  assert.ok(radio.indexOf('com.samsung.android.permissioncontroller') < radio.indexOf('startExplicit'));
  const intent = plugin.slice(plugin.indexOf('private Intent locationRadioIntent'), plugin.indexOf('private Intent appPermissionsIntent'));
  assert.match(intent, /PERMISSION_GROUP_NAME/);
  assert.match(intent, /EXTRA_APP_PACKAGE/);
  assert.equal(intent.includes('ACCESS_FINE_LOCATION'), false);
  assert.match(plugin, /android.permission-group.LOCATION/);
  assert.match(plugin, /ManageAppPermissionActivity/);
  const resume = plugin.slice(plugin.indexOf('protected void handleOnResume'), plugin.indexOf('public void openBattery'));
  assert.equal(resume.includes('advanceFallback'), false);
  assert.ok(resume.indexOf('scheduleBounceConfirm') < resume.indexOf('resolveAlways'));
});

test('keep-alive notification is asked at entry until allowed, and started only after an explicit tap', () => {
  const base = { notifications: 'unknown', locationMode: 'unknown', keepAlive: false, permissionAsked: false, startAsked: false };
  assert.equal(keepEntryPrompt(base), 'permission');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'denied' }), 'permission');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'denied', permissionAsked: true }), 'none');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'skipped' }), 'none');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'granted', locationMode: 'while-using' }), 'none');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'granted', locationMode: 'always' }), 'start');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'granted', locationMode: 'always', startAsked: true }), 'none');
  assert.equal(keepEntryPrompt({ ...base, notifications: 'granted', locationMode: 'always', keepAlive: true }), 'none');
});

test('location keep does not post an ongoing shade card', () => {
  const location = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/LocationKeepService.java', import.meta.url), 'utf8');
  const watch = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/AlertWatchService.java', import.meta.url), 'utf8');
  const cleanup = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/OngoingNotificationCleanup.java', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.equal(location.includes('Umap 위치 공유'), false);
  assert.equal(location.includes('위치를 보내는 중'), false);
  assert.equal(location.includes('위치 유지 끄기'), false);
  assert.equal(location.includes('startForeground('), false);
  assert.equal(watch.includes('startForeground('), false);
  assert.equal(location.includes('IMPORTANCE_MIN'), false);
  assert.equal(watch.includes('IMPORTANCE_MIN'), false);
  assert.equal(location.includes('\\u2060'), false);
  assert.equal(watch.includes('\\u2060'), false);
  assert.match(location, /requestLocationUpdates/);
  assert.match(watch, /setExactAndAllowWhileIdle/);
  assert.match(watch, /IMPORTANCE_HIGH/);
  assert.match(watch, /SOS/);
  assert.match(cleanup, /deleteNotificationChannel\(LOCATION_CHANNEL\)/);
  assert.match(cleanup, /deleteNotificationChannel\(QUIET_CHANNEL\)/);
  assert.match(cleanup, /deleteNotificationChannel\(WATCH_CHANNEL\)/);
  assert.match(cleanup, /umap_location_quiet/);
  assert.match(cleanup, /umap_alert_watch/);
  assert.match(cleanup, /"umap_location"/);
  assert.equal(manifest.includes('foregroundServiceType'), false);
  assert.match(manifest, /LocationKeepReceiver/);
  assert.match(manifest, /AlertWatchReceiver/);
  assert.match(manifest, /USE_EXACT_ALARM/);
});

test('gps is 2.5s only while moving and backs off to 2 then 5 minutes while still', () => {
  const location = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/LocationKeepService.java', import.meta.url), 'utf8');
  assert.match(location, /GPS_MOVING_MS = 2_500L/);
  assert.match(location, /SAMPLE_GAP_MS = 1_200L/);
  assert.match(location, /GPS_STILL_MS = 120_000L/);
  assert.match(location, /GPS_STILL_LONG_MS = 300_000L/);
  assert.match(location, /STILL_LONG_AFTER_MS = 7 \* 60_000L/);
  assert.match(location, /MOVING_HOLD_MS = 45_000L/);
  assert.match(location, /PUBLISH_MOVING_MS = 8_000L/);
  assert.match(location, /PUBLISH_STILL_MS = 120_000L/);
  assert.match(location, /PUBLISH_MOVING_M = 25f/);
  assert.match(location, /requestedGpsMs = GPS_STILL_MS/);
  assert.match(location, /updatesRegistered && incoming\.equals\(registeredConfig\)/);
  assert.match(location, /movingStream = false/);
  assert.match(location, /GPS_PROVIDER, gpsMs, 0f/);
  assert.equal(location.includes('GPS_STILL_MS = 30_000L'), false);
  assert.equal(location.includes('GPS_STILL_LONGER'), false);
  assert.equal(location.includes('15_000L'), false);
  assert.equal(location.includes('GPS_MOVING_MS = 5_000L'), false);
  assert.equal(location.includes('GPS_MOVING_MS = 3_000L'), false);
  assert.equal(location.includes('5_000L, 0f'), false);
  assert.equal(location.includes('isStayJitter'), false);
});

test('browser permission buttons stay inside the browser prompt', () => {
  assert.equal(notificationAction(false), 'web-notification');
  assert.equal(alwaysAllowAction(false), 'browser-geolocation');
  assert.equal(motionAction(false, true), 'ios-motion-prompt');
  assert.equal(motionAction(false, false), 'explain-only');
  assert.equal(batteryAction(false), 'explain-only');
});
