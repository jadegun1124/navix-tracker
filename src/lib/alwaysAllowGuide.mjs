// In-app steps for Android 「항상 허용」. The app still opens the system screen;
// these lines only explain what to tap there.

export function alwaysAllowWhy() {
  return '앱을 닫아도 가족 지도에 이 폰이 보이게 하려면 위치를 항상 허용해야 합니다. 앱을 쓰는 동안에만 허용하면 화면을 끈 뒤 위치가 멈춥니다.';
}

export function alwaysAllowSteps() {
  return [
    '아래 「위치 액세스 권한 열기」를 누릅니다. 「위치 액세스 권한」 화면이 바로 열립니다.',
    '맨 위의 「항상 허용」을 고릅니다. 「앱 사용 중에만 허용」이나 「항상 확인 또는 공유 시 허용」이 아닙니다. 어떤 폰은 「앱을 사용하지 않을 때도 허용」이라고 나옵니다.',
    '위치 화면이 아니고 목록만 보이면 「위치」를 먼저 누릅니다. 그다음 같은 항목을 고릅니다.',
    '앱으로 돌아온 뒤 「배터리 제한 없음」을 누릅니다. 뜨는 창에서 허용을 직접 고릅니다.',
    '건너뛰었다면 왼쪽 위 메뉴의 「항상 허용 방법」에서 다시 엽니다. 설정에서도 열 수 있습니다.',
  ];
}

export const ALWAYS_GUIDE_MENU_LABEL = '항상 허용 방법';
