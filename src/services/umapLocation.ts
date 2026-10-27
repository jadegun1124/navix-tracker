import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface UmapFix {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  at: number;
}

export interface KeepAliveTarget {
  token: string;
  code: string;
  audience: 'admin' | 'family';
  sharing: boolean;
}

export interface KeepAliveConfig {
  baseUrl: string;
  name: string;
  precise: boolean;
  targets: KeepAliveTarget[];
}

export interface NativePromptResult {
  state: 'granted' | 'denied' | 'unavailable';
  openedSettings: boolean;
}

export interface AlwaysLocationResult {
  opened: boolean;
  location: 'always' | 'while-using' | 'denied' | 'unavailable';
  native: boolean;
}

export interface BatteryOptimizationResult {
  opened: boolean;
  unrestricted: boolean;
}

export interface NativeBattery {
  pct: number | null;
  charging: boolean | null;
}

export interface NativeSignInResult {
  credential?: string;
  error?: string;
}

interface UmapLocationPlugin {
  openSettings(): Promise<{ opened: boolean }>;
  openAlwaysLocation(): Promise<AlwaysLocationResult>;
  requestForeground(): Promise<{ location: 'while-using' | 'denied' | 'unavailable' }>;
  requestNotifications(): Promise<NativePromptResult>;
  requestMotion(): Promise<NativePromptResult>;
  openBattery(): Promise<BatteryOptimizationResult>;
  battery(): Promise<{ pct?: number | null; charging?: boolean | null }>;
  signIn(options: { clientId: string }): Promise<NativeSignInResult>;
  start(options: { config: string }): Promise<{ started: boolean; reason?: string }>;
  stop(): Promise<{ stopped: boolean }>;
  status(): Promise<{ running: boolean; userStopped: boolean; native: boolean; reason?: string }>;
  ackStopped(): Promise<void>;
  addListener(eventName: 'fix', listenerFunc: (fix: UmapFix) => void): Promise<PluginListenerHandle>;
}

const web: UmapLocationPlugin = {
  async openSettings() {
    return { opened: false };
  },
  async openAlwaysLocation() {
    return { opened: false, location: 'unavailable', native: false };
  },
  async requestForeground() {
    return { location: 'unavailable' };
  },
  async requestNotifications() {
    return { state: 'unavailable', openedSettings: false };
  },
  async requestMotion() {
    return { state: 'unavailable', openedSettings: false };
  },
  async openBattery() {
    return { opened: false, unrestricted: false };
  },
  async battery() {
    return { pct: null, charging: null };
  },
  async signIn() {
    return { error: 'web' };
  },
  async start() {
    return { started: false, reason: 'web' };
  },
  async stop() {
    return { stopped: true };
  },
  async status() {
    return { running: false, userStopped: false, native: false };
  },
  async ackStopped() {},
  async addListener() {
    return { remove: async () => {} };
  },
};

const plugin = registerPlugin<UmapLocationPlugin>('UmapLocation', { web });

export function umapLocationNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function openAppSettings(): Promise<boolean> {
  if (!umapLocationNative()) return false;
  try {
    const result = await plugin.openSettings();
    return result.opened === true;
  } catch {
    return false;
  }
}

export async function openAlwaysLocation(): Promise<AlwaysLocationResult> {
  if (!umapLocationNative()) return { opened: false, location: 'unavailable', native: false };
  try {
    const result = await plugin.openAlwaysLocation();
    const location = result.location === 'always' || result.location === 'while-using' || result.location === 'denied' ? result.location : 'unavailable';
    return { opened: result.opened === true, location, native: true };
  } catch {
    return { opened: false, location: 'unavailable', native: true };
  }
}

export async function requestForegroundLocation(): Promise<'while-using' | 'denied' | 'unavailable'> {
  if (!umapLocationNative()) return 'unavailable';
  try {
    const result = await plugin.requestForeground();
    return result.location === 'while-using' || result.location === 'denied' ? result.location : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function requestNotificationPermission(): Promise<NativePromptResult> {
  if (!umapLocationNative()) return { state: 'unavailable', openedSettings: false };
  try {
    const result = await plugin.requestNotifications();
    const state = result.state === 'granted' || result.state === 'denied' ? result.state : 'unavailable';
    return { state, openedSettings: result.openedSettings === true };
  } catch {
    return { state: 'unavailable', openedSettings: false };
  }
}

export async function requestMotionPermission(): Promise<NativePromptResult> {
  if (!umapLocationNative()) return { state: 'unavailable', openedSettings: false };
  try {
    const result = await plugin.requestMotion();
    const state = result.state === 'granted' || result.state === 'denied' ? result.state : 'unavailable';
    return { state, openedSettings: result.openedSettings === true };
  } catch {
    return { state: 'unavailable', openedSettings: false };
  }
}

export async function openBatteryOptimization(): Promise<BatteryOptimizationResult> {
  if (!umapLocationNative()) return { opened: false, unrestricted: false };
  try {
    const result = await plugin.openBattery();
    return { opened: result.opened === true, unrestricted: result.unrestricted === true };
  } catch {
    return { opened: false, unrestricted: false };
  }
}

export async function readNativeBattery(): Promise<NativeBattery> {
  if (!umapLocationNative()) return { pct: null, charging: null };
  try {
    const result = await plugin.battery();
    const pct = typeof result.pct === 'number' && result.pct >= 0 && result.pct <= 100 ? Math.round(result.pct) : null;
    const charging = result.charging === true ? true : result.charging === false ? false : null;
    return { pct, charging };
  } catch {
    return { pct: null, charging: null };
  }
}

export async function nativeGoogleSignIn(clientId: string): Promise<NativeSignInResult> {
  if (!umapLocationNative()) return { error: 'web' };
  try {
    return await plugin.signIn({ clientId });
  } catch {
    return { error: 'failed' };
  }
}

export const umapLocation = plugin;
