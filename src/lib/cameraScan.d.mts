export function cameraScanPlan(input: {
  native: boolean;
  hasUserMedia: boolean;
  hasBarcodeDetector: boolean;
}): {
  permission: 'android-runtime' | 'browser-prompt' | 'none';
  open: 'stream' | 'unsupported';
  decoder: 'barcode-detector' | 'jsqr' | 'none';
};

export function cameraDenialAction(input: {
  native: boolean;
  openedSettings: boolean;
  browserPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
}): 'settings' | 'browser-blocked' | 'retry';
