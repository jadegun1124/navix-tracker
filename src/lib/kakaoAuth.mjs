// Kakao Login. The Kakao user id is never the family member id.

export const KAKAO_SETUP_MESSAGE = [
  '카카오 로그인을 마치지 못했습니다. 이 상태로 시작하지 않습니다.',
  '1. Kakao Developers에서 애플리케이션을 만들고 카카오 로그인을 켭니다.',
  '2. Android 플랫폼 패키지는 kr.co.umap.tracker 이고, 키 해시는 사이드로드 SHA-1입니다.',
  '3. 앱은 VITE_KAKAO_NATIVE_APP_KEY와 KAKAO_NATIVE_APP_KEY, 웹은 VITE_KAKAO_JAVASCRIPT_KEY를 넣고 다시 빌드합니다.',
].join('\n');

export const KAKAO_VERIFY_MESSAGE = '카카오 계정 확인에 실패했습니다. 다시 로그인해 주세요.';
export const KAKAO_CANCEL_MESSAGE = '카카오 로그인을 취소했습니다.';

function kakaoAppKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key || /your-|placeholder|example|missing/i.test(key)) return '';
  if (!/^[A-Za-z0-9]{16,64}$/.test(key)) return '';
  return key;
}

export function kakaoNativeAppKey(value) {
  return kakaoAppKey(value);
}

export function kakaoJavascriptKey(value) {
  return kakaoAppKey(value);
}
