import { Capacitor } from '@capacitor/core';

/** Website stays on the company homepage. The family app opens in the native shell or `?app=1`. */
export function isFamilyAppSurface(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* browser */
  }
  return new URLSearchParams(window.location.search).get('app') === '1';
}
