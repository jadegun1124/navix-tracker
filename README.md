# 🛰️ umap (유맵) - 010 핸드폰 실시간 위치 궤적 & 고정밀 GPS 관제 플랫폼

> **"API 키 없이 언제 어디서나 010 휴대폰 및 스마트 단말기의 실시간 위치와 이동 궤적을 정밀하게 관제하는 밝은 화이트 테마 위치관제 솔루션"**

---

## 📱 스마트폰 위치추적 앱 & 4대 고정밀 알고리즘 파이프라인

본 플랫폼은 브라우저의 HTML5 Geolocation API를 활용한 전용 **모바일 위치추적 앱 (`umap GO Mobile`)**을 탑재하고 있으며, 부정확한 GPS 신호와 센서 오차를 완벽하게 정제하기 위한 **4단계 실시간 필터링 알고리즘**을 내장하고 있습니다.

### ① 오차 반경 (Accuracy) 필터링 & 신선도 검증 (핵심)
- **수평 오차 기준치 필터링**: 수신된 위치 데이터의 오차 반경(`location.accuracy`)이 **50m**를 초과할 경우 이상치로 판정하여 궤적 업데이트를 무시하고 즉시 폐기합니다.
- **과거 캐시 데이터 폐기**: `location.timestamp`를 확인하여 10초 이상 지난 오래된 캐시 좌표는 폐기합니다.

### ② 최소 이동 거리 (Distance Filter) 설정
- **정지 센서 노이즈 제거**: 단말기가 정지해 있을 때 발생하는 미세 센서 지터(Jitter)를 걸러내기 위해, 직전 좌표 대비 **최소 5m 이상 이동했을 때만** 유효한 위치 갱신으로 승인합니다.
- (iOS의 `locationManager.distanceFilter = 10`, Android의 `setMinUpdateDistanceMeters(10)` 원리 반영)

### ③ 칼만 필터 (Kalman Filter) 2D 좌표 보정
- 오차 공분산과 측정 오차를 기반으로 동적 칼만 게인($K$)을 계산하여, 빌딩 숲이나 실내 진입 시 발생하는 순간적인 좌표 튐(Spike) 현상을 부드럽고 매끄러운 궤적으로 실시간 수학적 보정합니다.

### ④ 속도 기반 이상치 제거 (Velocity Sanity Check)
- 두 좌표 간 이동 거리와 수신 시간 간격을 계산하여 이동 속도를 산출합니다. 사람이 걷거나 차량이 정상 주행할 수 없는 비정상적인 속도(예: 1초 만에 500m 이동 = 시속 1,800km/h 등, 기준치 시속 145km/h 초과)의 순간 점프 좌표를 자동으로 감지하여 폐기합니다.

---

## 🌟 주요 핵심 기능

1. **밝은 화이트 모드 디자인**: 가독성을 극대화한 세련된 모던 화이트/스카이블루 UI
2. **지도 API 키 0개 (완전 무료 오픈 지도)**:
   - Carto Voyager (선명한 화이트 벡터 지도)
   - Esri World Imagery & 라벨 (고해상도 위성 지도)
   - OpenStreetMap (표준 오픈 지도)
3. **010 핸드폰 번호 실시간 추적 & 궤적(Trail) 표시**:
   - `010-XXXX-XXXX` 번호 입력 시 즉시 단말기 등록 및 궤적 연결
   - 현재 위치 핀 마커 및 당일 이동 경로(선명한 실선 + 과거 페이딩 점선 + 시간대별 경유지 닷 마커)
4. **서울 노원구 기준 좌표 초기 설정**:
   - 상계동, 노원역 일대를 기본 관제 중심지로 셋업
5. **실시간 맵 알림 음소거/토글 버튼**:
   - 지도 우측 하단 컨트롤러에서 알림음 및 팝업 ON/OFF 지원
6. **QR 코드 스캔을 통한 스마트폰 원클릭 실행**:
   - PC 화면의 QR 코드를 휴대폰 카메라로 비추면 바로 고정밀 위치추적 앱으로 진입
7. **화면 꺼짐 방지 (Screen WakeLock API)**:
   - 스마트폰 화면이 꺼지지 않고 백그라운드 궤적을 지속 전송
8. **PWA (Progressive Web App) 완벽 지원**:
   - 아이폰/갤럭시에서 '홈 화면에 추가' 시 앱스토어 설치 없이 네이티브 앱처럼 전체화면 구동

---

## 🚀 깃허브(GitHub) 배포 방법 (24시간 어디서나 무료 접속)

본 프로젝트는 완전한 정적 웹 애플리케이션(SPA) 및 클라이언트 동기화 아키텍처로 빌드되어 있어, **GitHub Pages**에 올리면 개인 PC를 꺼두어도 전 세계 어디서나 24시간 스마트폰과 컴퓨터로 접속할 수 있습니다.

### 1단계: GitHub에 새 저장소(Repository) 생성
1. [GitHub.com](https://github.com/) 로그인 후 우측 상단 **[+] → [New repository]**
2. Repository name 입력 (예: `umap-gps-tracker`)
3. **Public** 선택 후 **[Create repository]** 클릭

### 2단계: 터미널에서 코드 푸시 (Push)
저장소 폴더에서 아래 명령어 실행 (또는 동봉된 `deploy-to-github.bat` 실행):

```powershell
# 1. 원격 저장소 연결 (본인의 GitHub 계정 및 저장소 이름으로 변경)
git remote add origin https://github.com/<본인_깃허브_아이디>/<저장소_이름>.git

# 2. 메인 브랜치 설정 및 푸시
git branch -M main
git push -u origin main
```

### 3단계: GitHub Pages 켜기 (최초 1회)
1. GitHub 저장소의 **[Settings]** 탭 클릭
2. 좌측 메뉴에서 **[Pages]** 클릭
3. **Build and deployment > Source**를 **`GitHub Actions`**로 선택!
4. 상단 **[Actions]** 탭에서 자동 빌드 및 배포가 완료되면 (약 1분 소요), 배포된 사이트 URL이 생성됩니다:
   👉 `https://<본인_아이디>.github.io/<저장소_이름>/`

---

## 🛠️ 기술 스택
- **프론트엔드**: React 19, TypeScript, Vite, Tailwind CSS v4
- **지도 엔진**: Leaflet (0 API Key - Carto Voyager, Esri Satellite, OSM)
- **알고리즘**: 2D Coordinate Kalman Smoothing Filter, Haversine Metric Engine, Velocity Sanity Checker
- **모바일 웹/PWA**: Screen WakeLock API, HTML5 Geolocation Watcher, Web App Manifest
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`)
