import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  currentAppVersionLabel,
  formatAppVersion,
  labelFromInstalled,
} from './appRelease.mjs';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('설정 shows versionName and versionCode', () => {
  assert.equal(APP_VERSION_NAME, '1.31.0');
  assert.equal(APP_VERSION_CODE, 34);
  assert.equal(formatAppVersion(), '앱 버전 1.31.0 (34)');
  assert.equal(formatAppVersion('1.31.0', ''), '앱 버전 1.31.0');
  assert.equal(labelFromInstalled('1.10.0 10'), '앱 버전 1.10.0 (10)');
  assert.equal(labelFromInstalled(''), '앱 버전 1.31.0 (34)');
  assert.equal(labelFromInstalled('not-a-version'), '앱 버전 1.31.0 (34)');
});

test('an installed APK version replaces the bundled label', () => {
  const previous = globalThis.window;
  globalThis.window = { UmapAndroid: { appVersion: () => '1.10.0 10' } };
  try {
    assert.equal(currentAppVersionLabel(), '앱 버전 1.10.0 (10)');
    globalThis.window = { UmapAndroid: { appVersion: () => '' } };
    assert.equal(currentAppVersionLabel(), '앱 버전 1.31.0 (34)');
    globalThis.window = {};
    assert.equal(currentAppVersionLabel(), '앱 버전 1.31.0 (34)');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('package.json, Gradle, and the release workflow stay on 1.31.0 / 34', () => {
  const pkg = JSON.parse(text('../../package.json'));
  const lock = JSON.parse(text('../../package-lock.json'));
  assert.equal(pkg.version, '1.31.0');
  assert.equal(lock.version, '1.31.0');
  assert.equal(lock.packages[''].version, '1.31.0');

  const gradle = text('../../android/app/build.gradle');
  assert.match(gradle, /versionCode 34\b/);
  assert.match(gradle, /versionName "1\.31\.0"/);
  assert.match(text('../../android/app/src/main/res/values/strings.xml'), /<string name="version_name">1\.31\.0<\/string>/);

  const workflow = text('../../.github/workflows/build-apk.yml');
  assert.match(workflow, /tag_name: v1\.31\.0/);
  assert.match(workflow, /versionName: 1\.31\.0/);
  assert.match(workflow, /versionCode: 34/);
  assert.match(workflow, /kinnex-v1\.31\.0\.apk/);
  assert.equal(workflow.includes('1.26.0'), false);

  const readme = text('../../README.md');
  assert.match(readme, /versionName`은 `1\.31\.0`/);
  assert.match(readme, /versionCode`는 34입니다/);
  assert.match(readme, /`v1\.26\.0`/);
  assert.match(text('../../PRD.md'), /kinnex-v1\.31\.0\.apk/);

  const home = text('../components/home/CompanyHome.tsx');
  assert.match(home, /APP_VERSION_NAME/);
  assert.equal(home.includes('1.25.0'), false);

  const geocode = text('./placeGeocode.mjs');
  assert.match(geocode, /APP_VERSION_NAME/);
  assert.equal(geocode.includes('1.24.0'), false);

  const main = text('../../android/app/src/main/java/kr/co/umap/tracker/MainActivity.java');
  assert.match(main, /String appVersion\(\)/);
  assert.match(main, /return name \+ " " \+ code/);

  const screen = text('../components/family/FamilyMapScreen.tsx');
  assert.equal((screen.match(/<AppVersionLine \/>/g) || []).length, 2);
});
