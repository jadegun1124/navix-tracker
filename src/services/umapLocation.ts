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

interface UmapLocationPlugin {
  openSettings(): Promise<{ opened: boolean }>;
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

export const umapLocation = plugin;
