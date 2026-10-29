// Naver Login (네아로). The Naver id is never the family member id.

export const NAVER_SETUP_MESSAGE = [
  '네이버 로그인을 마치지 못했습니다. 이 상태로 시작하지 않습니다.',
  '1. Naver Developers에서 애플리케이션을 만들고 네아로를 켭니다.',
  '2. Android 패키지는 kr.co.umap.tracker 이고, 다운로드 URL은 GitHub Releases APK입니다.',
  '3. VITE_NAVER_CLIENT_ID에 Client ID를 넣고, Worker에는 NAVER_CLIENT_SECRET을 넣습니다.',
].join('\n');

export const NAVER_VERIFY_MESSAGE = '네이버 계정 확인에 실패했습니다. 다시 로그인해 주세요.';
export const NAVER_CANCEL_MESSAGE = '네이버 로그인을 취소했습니다.';
export const NAVER_REDIRECT = 'kinnex://naver';

export function naverClientId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || /your-|placeholder|example/i.test(id)) return '';
  if (id.length < 8 || id.length > 64) return '';
  return id;
}

export function naverRedirectUri() {
  if (typeof window === 'undefined') return NAVER_REDIRECT;
  const origin = window.location.origin;
  const path = window.location.pathname || '/';
  if (origin.startsWith('https://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return `${origin}${path}`;
  }
  return NAVER_REDIRECT;
}
