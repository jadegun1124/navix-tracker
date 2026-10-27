// ID token claims from Google Identity Services or Android Credential Manager.
// Standard scopes are openid, email, profile. Phone is not requested.

export function decodeBase64Url(part) {
  const normalized = String(part).replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function verifiedPhoneFromClaims(claims) {
  if (!claims || claims.phone_number_verified !== true) return null;
  if (typeof claims.phone_number !== 'string') return null;
  const trimmed = claims.phone_number.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return trimmed;
}

export function profileFromIdTokenClaims(claims) {
  if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : '';
  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  const picture = typeof claims.picture === 'string' && claims.picture.trim() ? claims.picture.trim() : null;
  return {
    sub: claims.sub,
    name: name || email || 'Google 사용자',
    email,
    picture,
    preview: false,
    verifiedPhone: verifiedPhoneFromClaims(claims),
  };
}

export function decodeIdTokenPayload(credential) {
  try {
    const part = String(credential).split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(decodeBase64Url(part));
    return profileFromIdTokenClaims(claims);
  } catch {
    return null;
  }
}

export function signInFailureCopy(code) {
  switch (code) {
    case 'cancelled':
      return 'Google 로그인을 취소했습니다.';
    case 'missing-client':
      return '이 빌드에 Google 클라이언트 ID가 없습니다.';
    case 'unregistered':
      return '앱 로그인에는 같은 Google Cloud 프로젝트의 Android OAuth 클라이언트가 필요합니다. 패키지는 kr.co.umap.tracker 이고, 서명한 인증서의 SHA-1이 등록되어 있어야 합니다. 웹 버튼은 안드로이드 WebView에서 계정 선택을 끝내지 못합니다.';
    case 'unavailable':
      return '이 기기에서 Google 계정을 열지 못했습니다. Play 서비스와 인터넷을 확인해 주세요.';
    case 'token':
      return 'Google 계정 정보를 읽지 못했습니다. 다시 시도해 주세요.';
    default:
      return 'Google 로그인이 끝나지 않았습니다. 다시 시도해 주세요.';
  }
}
