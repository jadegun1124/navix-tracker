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
  assert.equal(APP_VERSION_NAME, '1.33.0');
  assert.equal(APP_VERSION_CODE, 37);
  assert.equal(formatAppVersion(), '앱 버전 1.33.0 (37)');
  assert.equal(formatAppVersion('1.33.0', ''), '앱 버전 1.33.0');
  assert.equal(labelFromInstalled('1.10.0 10'), '앱 버전 1.10.0 (10)');
  assert.equal(labelFromInstalled(''), '앱 버전 1.33.0 (37)');
  assert.equal(labelFromInstalled('not-a-version'), '앱 버전 1.33.0 (37)');
});

test('an installed APK version replaces the bundled label', () => {
  const previous = globalThis.window;
  globalThis.window = { UmapAndroid: { appVersion: () => '1.10.0 10' } };
  try {
    assert.equal(currentAppVersionLabel(), '앱 버전 1.10.0 (10)');
    globalThis.window = { UmapAndroid: { appVersion: () => '' } };
    assert.equal(currentAppVersionLabel(), '앱 버전 1.33.0 (37)');
    globalThis.window = {};
    assert.equal(currentAppVersionLabel(), '앱 버전 1.33.0 (37)');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('package.json, Gradle, and the release workflow stay on 1.33.0 / 37', () => {
  const pkg = JSON.parse(text('../../package.json'));
  const lock = JSON.parse(text('../../package-lock.json'));
  assert.equal(pkg.version, '1.33.0');
  assert.equal(lock.version, '1.33.0');
  assert.equal(lock.packages[''].version, '1.33.0');

  const gradle = text('../../android/app/build.gradle');
  assert.match(gradle, /versionCode 37\b/);
  assert.match(gradle, /versionName "1\.33\.0"/);
  assert.match(text('../../android/app/src/main/res/values/strings.xml'), /<string name="version_name">1\.33\.0<\/string>/);

  const workflow = text('../../.github/workflows/build-apk.yml');
  assert.match(workflow, /tag_name: v1\.33\.0/);
  assert.match(workflow, /versionName: 1\.33\.0/);
  assert.match(workflow, /versionCode: 37/);
  assert.match(workflow, /kinnex-v1\.33\.0\.apk/);
  assert.match(workflow, /keytool/);
  assert.match(workflow, /SHA1/);
  assert.equal(workflow.includes('1.26.0'), false);

  const readme = text('../../README.md');
  assert.match(readme, /versionName`은 `1\.33\.0`/);
  assert.match(readme, /versionCode`는 37입니다/);
  assert.match(readme, /`v1\.26\.0`/);
  assert.match(text('../../PRD.md'), /kinnex-v1\.33\.0\.apk/);

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
  assert.match(screen, /복구 코드/);
  assert.match(text('../components/family/Onboarding.tsx'), /카카오로 로그인/);
  assert.match(text('../components/family/Onboarding.tsx'), /네이버로 로그인/);
  assert.match(text('../components/family/Onboarding.tsx'), /복구 코드로 복원/);
  assert.equal(text('../components/family/Onboarding.tsx').includes('Google로'), false);
  assert.equal(text('../components/family/FamilyMapScreen.tsx').includes('Google 연결'), false);

  const manifest = text('../../android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="true"/);
  assert.match(manifest, /@xml\/backup_rules/);
  assert.match(manifest, /@xml\/data_extraction_rules/);
  assert.match(text('../../android/app/src/main/res/xml/backup_rules.xml'), /app_webview/);
  assert.match(text('../../android/app/src/main/res/xml/data_extraction_rules.xml'), /Local Storage/);
});
