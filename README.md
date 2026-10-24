# Umap

동의한 가족과 위치를 나누는 서비스입니다. 웹사이트는 회사 소개만 두고, 가족 지도는 휴대폰 앱에서 씁니다.

저장소 이름은 `jadegun1124/navix-tracker` 입니다. 제품 이름은 **Umap** 입니다.

## 화면

- 웹(GitHub Pages): 회사 홈페이지. 관제 콘솔은 없습니다.
- 앱: Capacitor 안드로이드 앱이 가족 위치 화면을 엽니다. 브라우저에서 같은 화면을 보려면 `?app=1` 을 붙입니다.

흐름은 Google 로그인 → 권한 안내 → 가족 지도 → 우리 집 → 초대 코드입니다.

## 권한

앱이 설명한 뒤에만 요청합니다.

| 권한 | 쓰는 이유 |
| :--- | :--- |
| 알림 | 집 도착·출발 |
| 위치 | 정확한 위치 또는 대략적인 위치. 앱 사용 중과 항상 허용을 사용자가 고릅니다. |
| 움직임 | 이동과 머무름을 구분해 위치 점을 안정시킬 때만 |
| 배터리 안내 | 항상 허용을 고른 경우에만 설정 경로를 알려 줍니다. 최적화 예외를 자동으로 요청하지 않습니다. |

마이크, 문자, 주변 소리, 원격으로 소리를 울리는 기능은 없습니다. 전화번호만으로 다른 사람을 찾지 않습니다.

항상 허용은 선호로 저장됩니다. 이 버전은 앱이 열려 있는 동안 위치를 갱신하고, 권한을 몰래 올리지 않습니다.

## Google 로그인과 지도

키는 환경 변수로만 넣습니다. `.env.example` 을 복사해 `.env.local` 을 만들고, GitHub Actions에는 같은 이름의 secret을 등록합니다.

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_MAPS_API_KEY=
```

- 로그인: [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview) 웹 클라이언트. 승인된 자바스크립트 원본에 사이트 주소와 Capacitor의 `https://localhost` 를 넣습니다.
- 지도: Maps JavaScript API. **무제한 무료가 아닙니다.** 월간 무료 사용량을 넘기면 과금됩니다. 최신 단가는 [Google Maps Platform 가격](https://mapsplatform.google.com/pricing/)에서 확인합니다. 키는 HTTP 리퍼러로 제한합니다.

클라이언트 ID나 지도 키가 없으면 로그인은 미리보기로 이어지고, 지도는 미리보기 격자로 표시됩니다. 미리보기라고 화면에 적습니다.

## 아이콘

승인된 마크는 파란 배경, 흰 위치 핀, 핀 안의 빨간 하트입니다. 핀 위에 머리 컬은 없습니다.

- 웹 파비콘과 PWA 아이콘: `public/`
- 안드로이드 런처·적응형 아이콘·스플래시: `android/app/src/main/res/`
- iOS 앱 아이콘과 스플래시 세트: `resources/ios/`
- 다시 그리기: `python3 scripts/render-umap-icon.py`

이 저장소에는 아직 Xcode 프로젝트가 없습니다. `resources/ios` 는 Capacitor iOS를 추가하기 전에 둔 에셋입니다. `ios/` 폴더를 미리 만들어 두면 `cap add ios` 가 막히므로 거기에 두지 않았습니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

회사 홈은 `/`, 앱 화면은 `/?app=1` 입니다. `/?app=1&reset=1` 은 이 브라우저에 저장된 가족 세션을 지웁니다.

## 안드로이드 APK

GitHub Actions `Build Android APK (Umap)` 가 디버그 APK를 만듭니다. 워크플로는 웹을 빌드한 뒤 `dist` 를 안드로이드 에셋으로 복사하고 `assembleDebug` 를 실행합니다.

## 데이터

가족, 우리 집, 권한 선택은 이 기기의 `localStorage` 에 있습니다. 초대 코드는 그 기기의 가족 목록에 사람을 더하는 데 쓰입니다. 기기 사이의 실시간 동기화 서버는 이 버전에 없습니다.
