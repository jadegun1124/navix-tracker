// Which system UI a permission button may open. Android must not fall through to a silent skip.

export function notificationAction(native) {
  return native ? 'post-notifications' : 'web-notification';
}

export function whileUsingAction(native) {
  return native ? 'foreground-location' : 'browser-geolocation';
}

export function alwaysAllowAction(native) {
  return native ? 'location-settings' : 'browser-geolocation';
}

export function motionAction(native, iosPrompt) {
  if (native) return 'activity-recognition';
  if (iosPrompt) return 'ios-motion-prompt';
  return 'explain-only';
}

export function batteryAction(native) {
  return native ? 'ignore-battery-optimizations' : 'explain-only';
}

// Android UmapLocationPlugin must open these. The location screen is the
// permission-group radio list, not the app-info page. Battery is the system
// popup, not the optimization list.
export const LOCATION_PERMISSION_ACTION = 'android.intent.action.MANAGE_APP_PERMISSION';
export const LOCATION_PERMISSION_GROUP = 'android.permission-group.LOCATION';
export const BATTERY_POPUP_ACTION = 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS';
