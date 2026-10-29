# AGENTS.md

## 기술 스택

- React 19, TypeScript, Vite, Tailwind CSS v4
- 웹: 회사 홈페이지. 가족 지도는 `?app=1` 또는 Capacitor 네이티브에서만 연다.
- 지도: Leaflet. 바탕은 국토교통부 VWorld 2D Base 한 종류. 키는 `import.meta.env.VITE_VWORLD_API_KEY`만 읽는다. 로컬은 gitignore된 `.env`의 `VITE_VWORLD_API_KEY`. Actions에는 `VITE_VWORLD_API_KEY`와 `VWORLD_API_KEY`가 있고, APK와 Pages 빌드가 Vite 이름으로 넘겨 결과물에 포함한다. 키가 없으면 한국어 안내를 보여 주고 타일을 요청하지 않는다. 위성·CARTO·OSM 전환은 없다. 이동 경로는 `localStorage` 세션에 둔다. 메인 지도는 아직 기록으로 넘기지 않은 이동 중 궤적만 그린다. 걸음은 5분, 시속 약 7km 이상은 12분 머물면 그 구간을 기록으로 넘기고 메인 선에서는 뺀다. 기록 화면은 고른 사람의 그날 저장 궤적을 그린다. 샘플 사람·예시 궤적은 넣지 않는다. 핀·구성원 카드·기록·방문한 곳 이름은 아파트/주거 단지 폴리곤 안(또는 약 30m)이면 단지명+동을 쓰고, 단지가 아닐 때만 아주 가까운 POI를 쓴다. 머무름이면 체류 중심점에 맞춘다.
- 로그인: 가족 지도의 표시 이름은 이 기기에 저장한다. 카카오·네이버 로그인은 계정 연결용이고, Worker가 토큰을 확인한다. 해당 키가 없으면 그 버튼은 비활성이다. 공개 값은 `VITE_KAKAO_NATIVE_APP_KEY`, `VITE_KAKAO_JAVASCRIPT_KEY`, `VITE_NAVER_CLIENT_ID`이다. 네이버 Client Secret은 Worker에만 둔다. 복구 코드로도 같은 사람과 가족 방을 불러온다. 전화번호는 신원으로 받지 않는다. 카카오 id·네이버 id는 구성원 ID로 쓰지 않는다. 예전 계정 레코드의 google 필드는 있으면 무시한다.
- 앱 셸: Capacitor Android. 표시 이름 Kinnex. 패키지 `kr.co.umap.tracker`.
- 아이콘: `python3 scripts/render-umap-icon.py` 가 `resources/icon.svg` 의 파란 그라데이션 타일(남색→시안)과 흰 위치 핀(파란 고리, 흰 점)을 런처·스플래시·파비콘에 넣는다. 적응형 아이콘은 그라데이션이 캔버스를 채우고, 핀만 66dp 안전 영역 안에 둔다.

## 제품 경계

- 위치 공유는 초대와 권한 동의 이후만.
- 마이크, 문자, 주변 소리, 원격 경보음을 넣지 않는다.
- 전화번호로 제삼자를 조회하지 않는다.
- 항상 허용은 화면에서 다시 확인한 뒤에만 선호로 저장한다. 몰래 백그라운드 권한으로 올리지 않는다. 위치 유지는 사용자가 켠 뒤에만 시작하고, 알림 목록에 상시 카드를 올리지 않는다. SOS, 집 반경, 그리고 고른 가족에게 보내는 움직임 시작·멈춤만 알림으로 올린다. 움직임 알림은 아무도 고르지 않으면 보내지 않는다. OS의 항상 허용은 설정 화면으로만 안내한다.
- API 키와 OAuth 시크릿을 커밋하지 않는다.

## 화면

- 모바일 너비의 가족 앱, 넓은 화면의 회사 홈.
- 한국어 UI.
