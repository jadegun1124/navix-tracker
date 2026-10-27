import { alwaysAllowAction, batteryAction, motionAction, notificationAction, whileUsingAction } from '../lib/systemSettings.mjs';
import type { PermissionState } from '../types/family';
import {
  openAlwaysLocation,
  openBatteryOptimization,
  requestForegroundLocation,
  requestMotionPermission,
  requestNotificationPermission,
  umapLocationNative,
} from './umapLocation';

export type PromptState = PermissionState['notifications'] | PermissionState['motion'];

function browserLocation(precise: boolean): Promise<'granted' | 'denied' | 'unavailable'> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: precise, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export async function askNotifications(): Promise<{ state: PromptState; note: string | null }> {
  if (notificationAction(umapLocationNative()) === 'post-notifications') {
    const result = await requestNotificationPermission();
    if (result.state === 'granted') return { state: 'granted', note: null };
    if (result.openedSettings) return { state: 'denied', note: '알림 창을 다시 띄울 수 없어 앱 알림 설정을 열었습니다. Umap 알림을 켜 주세요.' };
    if (result.state === 'denied') return { state: 'denied', note: null };
    return { state: 'denied', note: '알림 허용 창을 열지 못했습니다.' };
  }
  if (!('Notification' in window)) return { state: 'skipped', note: '이 브라우저에는 알림 창이 없습니다.' };
  try {
    const result = await Notification.requestPermission();
    return { state: result === 'granted' ? 'granted' : 'denied', note: null };
  } catch {
    return { state: 'denied', note: '알림 허용 창을 열지 못했습니다.' };
  }
}

export async function askWhileUsing(precise: boolean): Promise<{ location: 'while-using' | 'denied' | 'unavailable'; note: string | null }> {
  if (whileUsingAction(umapLocationNative()) === 'foreground-location') {
    const result = await requestForegroundLocation();
    if (result === 'while-using') return { location: 'while-using', note: null };
    if (result === 'denied') return { location: 'denied', note: null };
    return { location: 'unavailable', note: '위치 허용 창을 열지 못했습니다.' };
  }
  const result = await browserLocation(precise);
  if (result === 'granted') return { location: 'while-using', note: null };
  if (result === 'denied') return { location: 'denied', note: null };
  return { location: 'unavailable', note: '이 브라우저에서 위치를 받지 못했습니다.' };
}

export async function askAlwaysLocation(precise: boolean): Promise<{ location: 'always' | 'while-using' | 'denied' | 'unavailable'; note: string | null }> {
  if (alwaysAllowAction(umapLocationNative()) === 'location-settings') {
    const result = await openAlwaysLocation();
    if (!result.opened) {
      if (result.location === 'always') return { location: 'always', note: '위치 권한이 항상 허용입니다.' };
      return { location: 'unavailable', note: '위치 권한 화면을 열지 못했습니다.' };
    }
    if (result.location === 'always') return { location: 'always', note: '위치 권한이 항상 허용입니다.' };
    if (result.location === 'denied') return { location: 'denied', note: '설정에서 위치 접근을 항상 허용으로 바꿀 수 있습니다. 앱이 그 스위치를 대신 바꾸지는 않습니다.' };
    return { location: 'while-using', note: '설정에서 위치를 항상 허용으로 고른 뒤 앱으로 돌아오면 됩니다. 앱이 그 스위치를 대신 바꾸지는 않습니다.' };
  }
  const result = await browserLocation(precise);
  const location = result === 'denied' ? 'denied' : result === 'granted' ? 'while-using' : 'unavailable';
  return {
    location,
    note: '브라우저에는 항상 허용 설정이 없습니다. 위치 허용 창만 띄우며, 항상 허용은 안드로이드 앱의 위치 권한 화면에서 고릅니다.',
  };
}

export async function askMotion(): Promise<{ state: 'granted' | 'denied' | 'skipped'; note: string | null }> {
  const iosPrompt = typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
  const action = motionAction(umapLocationNative(), iosPrompt);
  if (action === 'activity-recognition') {
    const result = await requestMotionPermission();
    if (result.state === 'granted') return { state: 'granted', note: null };
    if (result.openedSettings) return { state: 'denied', note: '움직임 권한 창을 다시 띄울 수 없어 설정 화면을 열었습니다. 신체 활동 또는 움직임을 허용해 주세요.' };
    if (result.state === 'denied') return { state: 'denied', note: null };
    return { state: 'denied', note: '움직임 권한 창을 열지 못했습니다.' };
  }
  if (action === 'ios-motion-prompt') {
    try {
      const request = (DeviceMotionEvent as unknown as { requestPermission: () => Promise<'granted' | 'denied'> }).requestPermission;
      const result = await request();
      return { state: result === 'granted' ? 'granted' : 'denied', note: null };
    } catch {
      return { state: 'denied', note: '움직임 허용 창을 열지 못했습니다.' };
    }
  }
  return { state: 'skipped', note: '이 브라우저에는 움직임 권한 창이 없습니다. 안드로이드 앱에서는 신체 활동 권한을 묻습니다.' };
}

export async function askBattery(): Promise<{ opened: boolean; unrestricted: boolean; note: string | null }> {
  if (batteryAction(umapLocationNative()) === 'ignore-battery-optimizations') {
    const result = await openBatteryOptimization();
    if (result.opened) return { opened: true, unrestricted: result.unrestricted, note: null };
    if (result.unrestricted) return { opened: false, unrestricted: true, note: null };
    return { opened: false, unrestricted: false, note: '배터리 제한 없음 팝업을 열지 못했습니다.' };
  }
  return { opened: false, unrestricted: false, note: '배터리 제한 없음 창은 안드로이드 앱에서 열립니다. 브라우저에서는 그 설정을 바꾸지 않습니다.' };
}
