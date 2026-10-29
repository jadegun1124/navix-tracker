import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_LINKED_OTHER_MESSAGE, linkedAccountWouldSwitch } from './accountRestore.mjs';
import { KAKAO_SETUP_MESSAGE, kakaoJavascriptKey, kakaoNativeAppKey } from './kakaoAuth.mjs';
import { NAVER_REDIRECT, NAVER_SETUP_MESSAGE, allowedNaverRedirect, naverClientId } from './naverAuth.mjs';

test('missing Kakao and Naver keys keep those buttons closed', () => {
  assert.equal(kakaoNativeAppKey(''), '');
  assert.equal(kakaoNativeAppKey('placeholder'), '');
  assert.equal(kakaoNativeAppKey('short'), '');
  assert.equal(kakaoNativeAppKey('abc123def456ghi789jkl012mno345pq'), 'abc123def456ghi789jkl012mno345pq');
  assert.equal(kakaoJavascriptKey(''), '');
  assert.equal(kakaoJavascriptKey('javascriptkey123456'), 'javascriptkey123456');
  assert.match(KAKAO_SETUP_MESSAGE, /VITE_KAKAO_NATIVE_APP_KEY/);
  assert.match(KAKAO_SETUP_MESSAGE, /VITE_KAKAO_JAVASCRIPT_KEY/);
  assert.match(KAKAO_SETUP_MESSAGE, /kr\.co\.umap\.tracker/);

  assert.equal(naverClientId(''), '');
  assert.equal(naverClientId('example-id'), '');
  assert.equal(naverClientId('short'), '');
  assert.equal(naverClientId('naverclientid1'), 'naverclientid1');
  assert.equal(NAVER_REDIRECT, 'kinnex://naver');
  assert.equal(allowedNaverRedirect('kinnex://naver'), 'kinnex://naver');
  assert.equal(allowedNaverRedirect('https://jadegun1124.github.io/kinnex/'), 'https://jadegun1124.github.io/kinnex/');
  assert.equal(allowedNaverRedirect('http://localhost:5173/'), 'http://localhost:5173/');
  assert.equal(allowedNaverRedirect('https://evil.example/callback'), '');
  assert.match(NAVER_SETUP_MESSAGE, /VITE_NAVER_CLIENT_ID/);
  assert.match(NAVER_SETUP_MESSAGE, /NAVER_CLIENT_SECRET/);

  assert.equal(linkedAccountWouldSwitch('local-restore1', { memberId: 'local-restore1' }), false);
  assert.equal(linkedAccountWouldSwitch('local-restore1', { memberId: 'local-other2' }), true);
  assert.equal(linkedAccountWouldSwitch('', { memberId: 'local-other2' }), false);
  assert.match(ACCOUNT_LINKED_OTHER_MESSAGE, /다른 사람/);
});
