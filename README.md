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

항상 허용은 화면에서 한 번 더 확인한 뒤에만 선호로 저장됩니다. 확인 없이 백그라운드 권한으로 올리지 않습니다.

안드로이드에서 설정 → 앱 → Umap → 권한 → 위치를 **항상 허용**으로 바꾸면, 앱을 내려 둔 동안 "가족에게 위치를 공유하는 중" 알림을 켜고 좌표를 보냅니다. **앱 사용 중에만**이면 화면이 꺼지거나 다음 날 프로세스가 죽으면 갱신이 멈춥니다. 앱을 강제 종료해도 안드로이드가 그 알림을 다시 켜지 않습니다. 배터리에서 제한 없음을 고르면 아침에 덜 끊깁니다. 브라우저 `?app=1` 은 그 탭이 열려 있을 때만 갱신됩니다.

Google 로그인은 [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview)의 ID 토큰만 씁니다. 요청 범위는 `openid`, `email`, `profile` 이고, 받는 값은 이름, 이메일, 프로필 사진입니다. 유료 Google API 범위는 넣지 않습니다.

## Google 로그인과 지도

키는 환경 변수로만 넣습니다. 로컬에서는 `.env.example` 을 복사해 `.env` 를 만들고 `VITE_VWORLD_API_KEY=` 뒤에 키를 적습니다. `.env` 는 gitignore 되어 있어 커밋되지 않습니다.

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_MAPS_API_KEY=
VITE_VWORLD_API_KEY=
VITE_FAMILY_SYNC_URL=
```

- 로그인: [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview) 웹 클라이언트. 범위는 `openid`, `email`, `profile` 만입니다. 승인된 자바스크립트 원본에 사이트 주소와 Capacitor의 `https://localhost` 를 넣습니다.
- 지도: 국토교통부 [VWorld](https://www.vworld.kr/) 2D Base 한 종류입니다. 위성, CARTO, OpenStreetMap 전환은 없습니다.
  - `https://api.vworld.kr/req/wmts/1.0.0/{API_KEY}/Base/{z}/{y}/{x}.png`
  - 키는 `import.meta.env.VITE_VWORLD_API_KEY`만 읽습니다. 빌드 시점에 JS 안에 들어갑니다.
  - 키가 없으면 "키가 이 빌드에 없습니다"만 보여 주고 타일을 요청하지 않습니다. 키가 있는데 타일이 실패하면, 그 페이지의 주소(origin)를 인증키 도메인에 넣으라는 안내가 나옵니다. 타일이 한 장이라도 오면 안내는 사라집니다.
  - 인증키 서비스 URL: `https://jadegun1124.github.io`, 앱 `https://localhost`, 로컬 개발 `http://localhost:5173`.
- 이동 경로: 선택한 사람의 오늘(서울 날짜) 선만 지도에 있습니다. 약 12m 이상 움직이면 이 기기에 최대 300점까지 쌓입니다. 자정이 지나면 선은 비우고 현재 핀은 남습니다. 샘플 사람이나 예시 좌표는 없습니다. 속도는 도보, 자전거, 차량, 비행기로 나눕니다. 걸음 수는 기기 만보계가 있으면 그 값을, 없으면 거리로 추정하고 화면에 추정이라고 적습니다.

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

같은 브라우저에서 피관리자가 공유를 허용하면 그 좌표가 `umap_family_places_v1`로 관리자 탭의 아이 핀에 붙습니다. 다른 폰은 아래 동기화 서버를 통합니다. 서버가 없거나 끊기면 같은 브라우저 공유만 남고, 화면에 그 사실을 한국어로 알립니다. 집 이탈 사이렌은 관리자 화면에만, SOS 사이렌은 피관리자 폰과 관리자 화면에 울립니다. 서버가 연결되어 있으면 다른 폰의 관리자 화면에도 전달됩니다. 문자는 쓰지 않습니다. 전화번호로 위치를 찾지 않습니다.

## 다른 폰과 위치 나누기

피관리자가 초대를 수락하고 **위치 공유 허용**을 누른 뒤에만 좌표가 나갑니다. 허용 전에는 핀이 없고, 공유를 끄거나 연결을 끊으면 좌표를 지운 상태가 전달되어 관리자 지도의 핀이 사라집니다. 전화번호는 이 동기화에 쓰지 않습니다.

관리자 지도는 초대 코드와 이름으로 핀을 맞춥니다. 코드가 같고 이름이 같거나, 그 코드의 피관리자가 한 명이면 붙습니다. 이 맞추기는 `apply-shared-place` 그대로입니다.

1. 관리자 폰이 쓰기 키와 읽기 키를 만듭니다. 읽기 키는 그 폰의 세션에만 있습니다.
2. 초대 링크에는 초대 코드, 쓰기 키, 읽기 키의 해시가 들어갑니다. 읽기 키 원문은 링크에 없습니다.
3. 위치 공유를 허용한 피관리자 폰이 최신 점 하나를 `PUT /v1/rooms/{코드}/place` 로 보냅니다. 약 8m 이상 움직이거나 잠시 머문 뒤 다시 보냅니다.
4. 관리자 화면은 약 2.5초마다 읽기 키로 그 방을 읽습니다. 쓰기 키만 가진 폰은 좌표를 읽을 수 없습니다.
5. 집 이탈과 SOS도 같은 방으로 갑니다. 다른 폰의 관리자 화면에서 사이렌이 울립니다.
6. 서버에는 이름별 최신 좌표(배터리, 이동 수단, 최근 여정, 최근 장소가 있으면 함께)와 최근 알림, 최근 대화 80개만 있습니다. 이동 경로 전체는 각 기기에만 쌓이고, 서울 날짜가 바뀌면 지도의 선만 지웁니다. 장소와 끝난 여정은 약 8일 둡니다.
7. 가족 대화는 `POST /v1/rooms/{코드}/message` 로 보내고, 관리자는 방 조회에 섞여 받는 메시지를 봅니다. 피관리자는 `GET /v1/rooms/{코드}/messages` 만 읽습니다. 이 조회는 읽기 키가 없어도 되고, 좌표는 돌려주지 않습니다. 전화번호는 받지 않습니다. Stream, Sendbird, Firebase 같은 유료 채팅 API는 쓰지 않습니다.

같은 브라우저의 `localStorage`와 `BroadcastChannel`은 그대로 둡니다. 서버가 죽어도 그 경로로 같은 브라우저 안에서는 핀이 움직입니다.

### 주소와 배포

클라이언트에 넣는 값은 Worker 주소 하나입니다. API 비밀이 아니고, 빌드 결과물에 들어갑니다. 읽기 키와 Cloudflare 토큰은 넣지 않습니다.

공개 Worker는 이미 올라가 있습니다. Pages와 APK 빌드는 secret이 없어도 이 주소를 넣습니다.

```text
https://umap-family-sync.umap-jadegun.workers.dev
```

`deploy.yml`과 `build-apk.yml`은 Actions secret `VITE_FAMILY_SYNC_URL`이 있을 때만 그 값으로 바꿉니다. secret은 필수가 아닙니다. 로그에는 기본 주소인지, secret으로 바꿨는지만 남기고 다른 주소 문자열은 찍지 않습니다. 로컬 `npm run dev`는 gitignore된 `.env`의 `VITE_FAMILY_SYNC_URL`을 읽습니다. 그 값이 없으면 개발 서버는 같은 브라우저 공유만 합니다.

Worker를 다시 올릴 때만 Cloudflare에 배포합니다. 계정 토큰은 저장소에 커밋하지 않습니다. 주소는 바꾸지 않습니다.

배터리, 이동 수단, 최근 여정, 장소, 가족 대화를 다른 폰에서 보려면 이 프로토콜이 올라간 Worker가 필요합니다. 지금 떠 있는 Worker는 좌표와 알림만 저장하고, 추가 필드는 버리고 `/message` 는 404를 돌려줍니다. 그 경우에도 위치 공유는 그대로 동작하고, 대화는 그 폰 안에만 남습니다. 배포 후에 같은 주소로 대화와 배터리가 오갑니다.

```bash
cd sync
npx wrangler@4 login
npx wrangler@4 deploy
```

배포 확인:

```bash
curl -s https://umap-family-sync.umap-jadegun.workers.dev/health
```

`{"ok":true,"service":"umap-family-sync"}` 이면 같은 주소입니다.

### 다음 날 위치가 안 바뀌던 이유

관리자 화면은 좌표가 같으면 갱신 시각을 무시했습니다. 집 안에 하룻밤 머문 폰이 같은 점을 다시 보내도 카드는 어제 시각으로 남았습니다. 피관리자 쪽은 페이지가 살아 있는 동안의 `watchPosition` 뿐이었고, 오류나 화면 복귀 때 감시를 다시 걸지 않았습니다. 안드로이드 "앱 사용 중"은 화면이 꺼지면 위치를 멈추고, 백그라운드 위치 권한과 포그라운드 알림이 없어 프로세스가 죽으면 서버의 마지막 점이 그대로였습니다. 일일 궤적 삭제는 원래 없었고, 이번에도 핀과 마지막 공유 점은 지우지 않습니다. 선만 서울 자정에 비웁니다.

`sync/wrangler.toml`이 Durable Object `FamilyRoom`을 만듭니다. 무료 한도에서 관리자 화면 하나가 켜져 있으면 조회가 하루 약 3만 번을 넘습니다. 한도에 닿으면 `src/services/familySync.ts`의 폴링 간격을 늘립니다.

### 두 기기로 확인

1. 폰 A와 폰 B에 같은 주소가 들어간 빌드를 설치합니다. `main`의 Pages와 APK는 `https://umap-family-sync.umap-jadegun.workers.dev` 를 기본으로 넣습니다.
2. 폰 A에서 관리자로 가족을 초대하고 **링크**를 보냅니다. 다섯 자리 코드만 보내면 같은 브라우저에서만 공유됩니다.
3. 폰 B에서 링크를 열고 피관리자로 수락한 뒤 **위치 공유 허용**을 누릅니다. 위치 권한도 허용합니다.
4. 폰 A에 B의 핀이 나타나고, 위에 "다른 폰과 위치를 나누는 중"이 보입니다.
5. 폰 B에서 공유를 끄면 몇 초 안에 A의 핀이 사라집니다.
6. 집 반경이 들어 있는 링크로 들어온 뒤 그 원을 나가면 A에서만 이탈 사이렌이 울립니다. B의 SOS는 A에도 전달됩니다.

로컬에서 서버 경로는 브라우저 프로필 두 개로 볼 수 있습니다. 프로필이 하나면 `localStorage`가 먼저 전달하므로 다른 폰 경로가 아닙니다.

```bash
npm run sync
```

`.env`에 `VITE_FAMILY_SYNC_URL=http://127.0.0.1:8787` 을 넣고 `npm run dev` 한 뒤, `http://127.0.0.1:5173/?app=1` 을 프로필마다 엽니다. 서버를 끄면 노란 안내가 나오고 같은 브라우저 공유만 남습니다.
