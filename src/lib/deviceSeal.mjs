import { Capacitor, registerPlugin } from '@capacitor/core';

const DeviceSeal = registerPlugin('DeviceSeal');
const PREFIX = 'umap-device-seal:';

export function deviceSealAvailable() {
  return Capacitor.isNativePlatform();
}

export async function sealDeviceText(plain) {
  if (!deviceSealAvailable() || typeof plain !== 'string') return plain;
  try {
    const result = await DeviceSeal.seal({ plain });
    return result && typeof result.sealed === 'string' && result.sealed.startsWith(PREFIX) ? result.sealed : plain;
  } catch {
    return plain;
  }
}

export async function openDeviceText(sealed) {
  if (typeof sealed !== 'string' || !sealed.startsWith(PREFIX)) return sealed;
  if (!deviceSealAvailable()) return '';
  try {
    const result = await DeviceSeal.open({ sealed });
    return result && typeof result.plain === 'string' ? result.plain : '';
  } catch {
    return '';
  }
}
