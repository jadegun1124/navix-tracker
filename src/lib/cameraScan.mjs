// Invite QR opens the camera whenever getUserMedia exists.
// Missing BarcodeDetector must not block the preview: Android WebView and
// some browsers decode with jsQR instead. Native builds ask for CAMERA first
// because the manifest permission is what lets the WebView show a dialog.

export function cameraScanPlan({ native, hasUserMedia, hasBarcodeDetector }) {
  return {
    permission: native ? 'android-runtime' : hasUserMedia ? 'browser-prompt' : 'none',
    open: hasUserMedia ? 'stream' : 'unsupported',
    decoder: !hasUserMedia ? 'none' : hasBarcodeDetector ? 'barcode-detector' : 'jsqr',
  };
}

export function cameraDenialAction({ native, openedSettings, browserPermission }) {
  if (native && openedSettings) return 'settings';
  if (!native && browserPermission === 'denied') return 'browser-blocked';
  return 'retry';
}
