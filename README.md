# Umap

동의한 가족과 위치를 나누는 서비스입니다. 웹사이트는 회사 소개만 두고, 가족 지도는 휴대폰 앱에서 씁니다.

제품 이름은 **Umap** 입니다. GitHub 저장소는 [jadegun1124/umap](https://github.com/jadegun1124/umap) 입니다.

## 공개 주소

| 무엇 | 어디 | 주소 |
| :--- | :--- | :--- |
| 회사 홈 | GitHub Pages | https://jadegun1124.github.io/umap/ |
| 앱 화면 미리보기 | 같은 Pages의 `?app=1` | https://jadegun1124.github.io/umap/?app=1 |
| 안드로이드 앱 | GitHub Releases APK v1.1.0 | https://github.com/jadegun1124/umap/releases/download/v1.1.0/umap-v1.1.0-tracker.apk |
| 릴리스 페이지 | GitHub Releases | https://github.com/jadegun1124/umap/releases/tag/v1.1.0 |

Google Play, App Store, TestFlight에는 올리지 않았습니다. iOS는 아이콘 에셋만 있고 설치 파일은 없습니다.

`main`에 푸시하면 GitHub Actions가 회사 홈을 Pages에 배포하고, 같은 커밋으로 디버그 APK를 만들어 GitHub Release `v1.1.0`의 `umap-v1.1.0-tracker.apk`를 갱신합니다. 이전 빌드는 `v1.0.0`에 남아 있습니다.

## 화면

- 웹(GitHub Pages): 회사 홈페이지. 관제 콘솔은 없습니다.
- 앱: Capacitor 안드로이드 앱이 가족 위치 화면을 엽니다. 브라우저에서 같은 화면을 보려면 `?app=1` 을 붙입니다.

흐름은 Google 로그인 → 관리자/피관리자 선택 → 권한 안내 → 가족 지도입니다. 관리자만 가족을 초대하고 지웁니다. 피관리자는 코드를 수락한 뒤 위치 공유를 따로 허용합니다.

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

키는 환경 변수로만 넣습니다. 로컬에서는 `.env.example` 을 복사해 `.env` 를 만들고 `VITE_VWORLD_API_KEY=` 뒤에 키를 적습니다. `.env` 는 gitignore 되어 있어 커밋되지 않습니다.

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_MAPS_API_KEY=
VITE_VWORLD_API_KEY=
```

- 로그인: [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview) 웹 클라이언트. 승인된 자바스크립트 원본에 사이트 주소와 Capacitor의 `https://localhost` 를 넣습니다.
- 지도: 국토교통부 [VWorld](https://www.vworld.kr/) 2D Base 한 종류입니다. 위성, CARTO, OpenStreetMap 전환은 없습니다.
  - `https://api.vworld.kr/req/wmts/1.0.0/{API_KEY}/Base/{z}/{y}/{x}.png`
  - 키는 `import.meta.env.VITE_VWORLD_API_KEY`만 읽습니다. 빌드 시점에 JS 안에 들어갑니다.
  - 키가 없으면 "키가 이 빌드에 없습니다"만 보여 주고 타일을 요청하지 않습니다. 키가 있는데 타일이 실패하면, 그 페이지의 주소(origin)를 인증키 도메인에 넣으라는 안내가 나옵니다. 타일이 한 장이라도 오면 안내는 사라집니다.
  - 인증키 서비스 URL: `https://jadegun1124.github.io`, 앱 `https://localhost`, 로컬 개발 `http://localhost:5173`.
- 이동 경로: 내 위치는 앱이 열려 있는 동안 약 12m 이상 움직이면 이 브라우저에 최대 300점까지 쌓입니다. 샘플 사람이나 예시 좌표는 없습니다.

클라이언트 ID가 없으면 로그인은 미리보기로 이어집니다. 미리보기라고 화면에 적습니다. `VITE_GOOGLE_MAPS_API_KEY`는 가족 지도에서 쓰지 않습니다.

GitHub Actions secret `VITE_VWORLD_API_KEY`와 `VWORLD_API_KEY`는 같은 값입니다. Pages 워크플로(`deploy.yml`)와 APK 워크플로(`build-apk.yml`)가 `npm run build`에 `VITE_VWORLD_API_KEY`를 넘깁니다. Vite용 secret이 비어 있으면 `VWORLD_API_KEY`를 그 이름으로 복사한 뒤 공백을 지웁니다. 로그에는 키가 있는지 여부만 남기고 문자열은 찍지 않습니다. secret을 바꾸면 `main`에 푸시해 두 워크플로를 다시 돌려야 배포된 Pages와 APK에 들어갑니다. PR 검사만으로는 키가 들어가지 않습니다. 로컬은 gitignore된 `.env`에 `VITE_VWORLD_API_KEY=`를 둡니다.

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

받는 곳: https://github.com/jadegun1124/umap/releases/download/v1.1.0/umap-v1.1.0-tracker.apk

`main` 푸시마다 `Build Android APK (Umap)` 워크플로가 웹을 빌드하고 `dist` 를 안드로이드 에셋으로 복사한 뒤 `assembleDebug` 로 APK를 만듭니다. 결과 파일은 GitHub Release `v1.1.0`에 올립니다. 앱 `versionName`은 `1.1.0`, `versionCode`는 2입니다. Play 스토어 트랙은 없습니다.

## 데이터

가족, 모드, 우리 집 반경, 권한, 위치 공유 허용은 이 탭의 `sessionStorage`와 모드별 `localStorage`(`umap_family_v1:admin`, `umap_family_v1:managed`)에 있습니다. 관리자 지도는 내 위치와, 위치 공유를 허용한 아이의 핀만 보여 줍니다. 피관리자 지도는 내 위치만 보여 주고, 관리자 카드는 공유 스위치일 뿐 위치 핀이 아닙니다.

같은 브라우저에서 피관리자가 공유를 허용하면 그 좌표가 `umap_family_places_v1`로 관리자 탭의 아이 핀에 붙습니다. 두 폰 사이의 좌표 전달 서버는 아직 없습니다. 집 이탈 사이렌은 관리자 화면에만, SOS 사이렌은 피관리자 폰과 관리자 화면에 울립니다. 다른 폰으로 보내려면 서버가 필요합니다. 문자는 쓰지 않습니다.
