import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cameraDenialAction, cameraScanPlan } from './cameraScan.mjs';

test('missing BarcodeDetector still opens the camera and decodes with jsQR', () => {
  const web = cameraScanPlan({ native: false, hasUserMedia: true, hasBarcodeDetector: false });
  assert.equal(web.permission, 'browser-prompt');
  assert.equal(web.open, 'stream');
  assert.equal(web.decoder, 'jsqr');

  const android = cameraScanPlan({ native: true, hasUserMedia: true, hasBarcodeDetector: false });
  assert.equal(android.permission, 'android-runtime');
  assert.equal(android.open, 'stream');
  assert.equal(android.decoder, 'jsqr');
});

test('BarcodeDetector is used when present, and no camera API stays unsupported', () => {
  const detected = cameraScanPlan({ native: true, hasUserMedia: true, hasBarcodeDetector: true });
  assert.equal(detected.decoder, 'barcode-detector');
  assert.equal(detected.open, 'stream');

  const missing = cameraScanPlan({ native: true, hasUserMedia: false, hasBarcodeDetector: true });
  assert.equal(missing.open, 'unsupported');
  assert.equal(missing.decoder, 'none');
});

test('permanent camera denial opens Android settings, and a blocked browser does not pretend to', () => {
  assert.equal(cameraDenialAction({ native: true, openedSettings: true, browserPermission: 'unknown' }), 'settings');
  assert.equal(cameraDenialAction({ native: true, openedSettings: false, browserPermission: 'unknown' }), 'retry');
  assert.equal(cameraDenialAction({ native: false, openedSettings: false, browserPermission: 'denied' }), 'browser-blocked');
  assert.equal(cameraDenialAction({ native: false, openedSettings: false, browserPermission: 'prompt' }), 'retry');
});

test('android manifest and plugin wire CAMERA without a microphone', () => {
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../../android/app/src/main/java/kr/co/umap/tracker/UmapLocationPlugin.java', import.meta.url), 'utf8');
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.equal(manifest.includes('RECORD_AUDIO'), false);
  assert.match(plugin, /void requestCamera\(PluginCall call\)/);
  assert.match(plugin, /android\.Manifest\.permission\.CAMERA/);
});
