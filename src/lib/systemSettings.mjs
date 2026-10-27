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
