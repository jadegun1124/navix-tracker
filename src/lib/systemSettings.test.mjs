import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_DETAILS_ACTION, BATTERY_POPUP_ACTION, LOCATION_PERMISSION_ACTION, LOCATION_PERMISSION_GROUP, LOCATION_PERMISSION_LIST_ACTION, alwaysAllowAction, alwaysAllowScreens, batteryAction, motionAction, notificationAction, whileUsingAction } from './systemSettings.mjs';

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
});

test('browser permission buttons stay inside the browser prompt', () => {
  assert.equal(notificationAction(false), 'web-notification');
  assert.equal(alwaysAllowAction(false), 'browser-geolocation');
  assert.equal(motionAction(false, true), 'ios-motion-prompt');
  assert.equal(motionAction(false, false), 'explain-only');
  assert.equal(batteryAction(false), 'explain-only');
});
