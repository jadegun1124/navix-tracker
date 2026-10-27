import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeFix {
  lat: number;
  lng: number;
  at: number;
  accuracyM: number;
  speedMps: number | null;
}

export interface ShareTarget {
  endpoint: string;
  token: string;
  code: string;
  name: string;
}

interface UmapPresencePlugin {
  locationAccess(): Promise<{ access: string }>;
  openAppSettings(): Promise<void>;
  requestBackgroundLocation(): Promise<{ access: string }>;
  readStepCounter(): Promise<{ steps: number | null }>;
  requestStepCounter(): Promise<void>;
  startShare(options: { targets: string }): Promise<{ started: boolean; reason?: string }>;
  stopShare(): Promise<void>;
  drainPoints(options: { after: number }): Promise<{ points: NativeFix[] }>;
}

const plugin = registerPlugin<UmapPresencePlugin>('UmapPresence');

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function readOsLocationAccess(): Promise<'always' | 'while-in-use' | 'denied' | 'unsupported'> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const result = await plugin.locationAccess();
    if (result.access === 'always' || result.access === 'while-in-use' || result.access === 'denied') return result.access;
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export async function openLocationSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await plugin.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

export async function requestAlwaysLocation(): Promise<'always' | 'while-in-use' | 'denied' | 'unsupported'> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const result = await plugin.requestBackgroundLocation();
    if (result.access === 'always' || result.access === 'while-in-use' || result.access === 'denied') return result.access;
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export async function readBatteryPercent(): Promise<number | null> {
  const getter = (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery;
  if (typeof getter !== 'function') return null;
  try {
    const battery = await getter.call(navigator);
    if (!Number.isFinite(battery.level)) return null;
    return Math.round(Math.min(1, Math.max(0, battery.level)) * 100);
  } catch {
    return null;
  }
}

export async function readDeviceSteps(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const result = await plugin.readStepCounter();
    return typeof result.steps === 'number' && Number.isFinite(result.steps) ? result.steps : null;
  } catch {
    return null;
  }
}

export async function requestStepCounter(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await plugin.requestStepCounter();
  } catch {
    /* 만보계가 없어도 거리 추정을 씁니다. */
  }
}

export async function startNativeShare(targets: ShareTarget[]): Promise<boolean> {
  if (!isNativeApp() || targets.length === 0) return false;
  try {
    const result = await plugin.startShare({ targets: JSON.stringify(targets.slice(0, 5)) });
    return result.started === true;
  } catch {
    return false;
  }
}

export async function stopNativeShare(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await plugin.stopShare();
  } catch {
    /* 웹에서는 백그라운드 공유가 없습니다. */
  }
}

export async function drainNativePoints(after: number): Promise<NativeFix[]> {
  if (!isNativeApp()) return [];
  try {
    const result = await plugin.drainPoints({ after });
    if (!Array.isArray(result.points)) return [];
    return result.points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.at));
  } catch {
    return [];
  }
}
