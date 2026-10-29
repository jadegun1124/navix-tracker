import assert from 'node:assert/strict';
import test from 'node:test';
import { KAKAO_SETUP_MESSAGE, kakaoNativeAppKey } from './kakaoAuth.mjs';
import { NAVER_REDIRECT, NAVER_SETUP_MESSAGE, naverClientId } from './naverAuth.mjs';

test('missing Kakao and Naver keys keep those buttons closed', () => {
  assert.equal(kakaoNativeAppKey(''), '');
  assert.equal(kakaoNativeAppKey('placeholder'), '');
  assert.equal(kakaoNativeAppKey('short'), '');
  assert.equal(kakaoNativeAppKey('abc123def456ghi789jkl012mno345pq'), 'abc123def456ghi789jkl012mno345pq');
  assert.match(KAKAO_SETUP_MESSAGE, /VITE_KAKAO_NATIVE_APP_KEY/);
  assert.match(KAKAO_SETUP_MESSAGE, /kr\.co\.umap\.tracker/);

  assert.equal(naverClientId(''), '');
  assert.equal(naverClientId('example-id'), '');
  assert.equal(naverClientId('short'), '');
  assert.equal(naverClientId('naverclientid1'), 'naverclientid1');
  assert.equal(NAVER_REDIRECT, 'kinnex://naver');
  assert.match(NAVER_SETUP_MESSAGE, /VITE_NAVER_CLIENT_ID/);
  assert.match(NAVER_SETUP_MESSAGE, /NAVER_CLIENT_SECRET/);
});
