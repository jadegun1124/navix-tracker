# AGENTS.md

## 기술 스택

- React 19, TypeScript, Vite, Tailwind CSS v4
- 웹: 회사 홈페이지. 가족 지도는 `?app=1` 또는 Capacitor 네이티브에서만 연다.
- 지도: Leaflet. 바탕은 국토교통부 VWorld 2D Base 한 종류. 키는 `VITE_VWORLD_API_KEY`(또는 `VWORLD_API_KEY`). 키가 없으면 한국어 안내를 보여 주고 타일을 요청하지 않는다. 위성·CARTO·OSM 전환은 없다. 이동 경로는 `localStorage` 세션에 두고 선택한 구성원만 선으로 보여 준다. 샘플 사람·예시 궤적은 넣지 않는다.
- 로그인: Google Identity Services. 키는 `VITE_GOOGLE_CLIENT_ID`.
- 앱 셸: Capacitor Android. 표시 이름 Umap. 패키지 `kr.co.umap.tracker`.
- 아이콘: `python3 scripts/render-umap-icon.py` 가 파란 타일, 흰 핀, 빨간 하트 마크를 런처와 스플래시에 넣는다.

## 제품 경계

- 위치 공유는 초대와 권한 동의 이후만.
- 마이크, 문자, 주변 소리, 원격 경보음을 넣지 않는다.
- 전화번호로 제삼자를 조회하지 않는다.
- 항상 허용은 화면에서 다시 확인한 뒤에만 선호로 저장한다. 몰래 백그라운드 권한으로 올리지 않는다.
- API 키와 OAuth 시크릿을 커밋하지 않는다.

## 화면

- 모바일 너비의 가족 앱, 넓은 화면의 회사 홈.
- 한국어 UI.
