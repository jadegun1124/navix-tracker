import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gradleUrl = new URL('../../android/app/build.gradle', import.meta.url);
const keystoreUrl = new URL('../../android/app/umap-sideload.keystore', import.meta.url);

test('debug and release share the committed sideload keystore', () => {
  const gradle = readFileSync(gradleUrl, 'utf8');
  assert.match(gradle, /storeFile file\('umap-sideload\.keystore'\)/);
  assert.match(gradle, /storePassword 'umap-sideload'/);
  assert.match(gradle, /keyAlias 'umap-sideload'/);
  assert.match(gradle, /keyPassword 'umap-sideload'/);
  assert.match(gradle, /debug \{\s*signingConfig signingConfigs\.sideload\s*\}/);
  assert.match(gradle, /release \{\s*signingConfig signingConfigs\.sideload/);
  assert.equal(gradle.includes('signingConfig signingConfigs.debug'), false);

  const keystore = readFileSync(keystoreUrl);
  assert.ok(keystore.length > 1000);
  assert.equal(keystore[0], 0x30);
  const alias = Buffer.alloc('umap-sideload'.length * 2);
  for (let i = 0; i < 'umap-sideload'.length; i += 1) alias.writeUInt16BE('umap-sideload'.charCodeAt(i), i * 2);
  assert.ok(keystore.includes(alias));
});
