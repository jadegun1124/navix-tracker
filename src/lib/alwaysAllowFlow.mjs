// iSharing-style Always Allow steps. The OS switch is never changed here.
// Overlay is only the floating hint on the system location screen.

export const WHILE_USING_TITLE = '"앱을 사용하는 동안 허용"으로 설정';
export const WHILE_USING_LEAD = '먼저 이 항목을 고르세요.';
export const WHILE_USING_OPTION = '앱 사용 중에만 허용';
export const WHILE_USING_ONCE = '이번만 허용';
export const WHILE_USING_DENY = '허용하지 않음';
export const WHILE_USING_MOCK_TITLE = "'Umap'이(가) 위치를 사용하도록 허용할까요?";
export const PRECISE_HINT = '정확한 위치 사용도 켜기';
export const COACH_NEXT = '다음';
export const OVERLAY_ASK_TITLE = '다른 앱 위에 표시';
export const OVERLAY_ASK_BODY = '설정 화면 위에 항상 허용 안내를 띄웁니다.';
export const OVERLAY_ALLOW = '표시 허용';
export const OVERLAY_SKIP = '건너뛰기';
export const OVERLAY_BANNER = 'Umap 항상 허용으로 설정';

export function nextAlwaysAllowAction({ native, foreground, overlay }) {
  if (!native) return 'browser';
  if (foreground === 'always') return 'done';
  if (foreground === 'denied') return 'stop';
  if (foreground === 'need') return 'request-foreground';
  if (overlay === 'granted') return 'settings-with-overlay';
  if (overlay === 'denied') return 'settings-fallback-guide';
  return 'ask-overlay';
}
