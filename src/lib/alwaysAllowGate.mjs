// Blocking gate after login on the Android shell.
// Web and the company homepage have no 항상 허용 switch, so they stay open.
// Splash and the login screen (Kakao, Naver, recovery code, 새로 시작, display name)
// stay open so 1.34 login-first onboarding still completes.

export const GATE_TITLE = '항상 허용이 필요합니다';
export const GATE_BODY = 'Kinnex는 앱을 닫아도 가족 위치를 나누려면 위치 권한 「항상 허용」이 필요합니다. 정확한 위치가 꺼져 있으면 백그라운드에서 위치를 이어 갈 수 없습니다.';
export const GATE_BUTTON = '설정에서 항상 허용 켜기';
export const GATE_OPENING = '여는 중…';
export const GATE_OPEN_FAILED = '설정 화면을 열지 못했습니다. 설정 > 앱 > Kinnex > 권한에서 위치를 누른 뒤 항상 허용을 고르세요.';

export function alwaysAllowGateCovers(stage) {
  return stage !== 'splash' && stage !== 'login';
}

// precise === false blocks even when the radio already says 항상 허용.
// precise == null keeps an older bridge that only reported the radio.
export function needsAlwaysAllowGate(snapshot) {
  if (!snapshot || snapshot.native !== true) return false;
  if (snapshot.location === 'always' && snapshot.precise !== false) return false;
  return true;
}

// First screen the gate button opens. Android 11+ (API 30) goes to the
// location permission page. Android 10 (API 29) may show the system
// background-location dialog. A dialog that will not appear falls through
// to that same settings page.
export function alwaysAllowGateTarget({
  sdk,
  foreground,
  background,
  precise,
  backgroundDialogAskable,
  fineDialogAskable,
}) {
  if (background && precise) return 'ready';
  if (sdk < 29) {
    if (!precise && fineDialogAskable) return 'foreground-dialog';
    return 'location-settings';
  }
  if (sdk === 29 && !background) {
    if (!foreground) return fineDialogAskable ? 'foreground-dialog' : 'location-settings';
    if (backgroundDialogAskable) return 'background-dialog';
  }
  return 'location-settings';
}
