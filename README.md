# 🛰️ NAVIX GO - 실시간 스마트 GPS 위치관제 웹 플랫폼

> **"내가 지키고 싶은 것이 지금 어디 있고, 어디를 거쳐 왔는지 한눈에 보여주는 지도 서비스"**  
> 국내 대표 GPS 트래커 브랜드 [나빅스(NAVIX)](https://www.nabix.co.kr/)의 웹 관제 시스템(NAVIX GO)을 모티브로 제작된 풀스택 웹 플랫폼 MVP입니다.

---

## 🌟 주요 핵심 기능

### 1. 대상별 맞춤형 관제 화면 (4개 시나리오 지원)
- **🎒 초등학생 (NAVIX X1L)**: 등하교 안심 타임라인(집 출발 → 학교 도착 → 학원 입실 → 귀가), SOS 비상 호출, 원격 소리 찾기
- **🐕 반려동물 (NAVIX C5L)**: 산책 경로 기록(거리, 시간, 소모 칼로리), 안심존 반경 이탈 감지, **긴급 실종 모드(Missing Mode: 1초 초고속 갱신)**
- **🚗 차량 (NAVIX C8L)**: 스마트 운행 일지(주행 거리, 최고 시속, 정차 횟수), 국세청 제출용 양식 기록, 안전 주차 위치 확인
- **🚲 귀중품/자산 (NAVIX A2L)**: 초저전력 정차 대기 모드, 움직임/진동 감지 센서 알림

### 2. 지도 및 실시간 추적 (Map & Live Trail)
- **커스텀 마커 & 펄스 애니메이션**: 대상별 전용 이모지 마커 + 실시간 펄스 파동 효과 + 배터리 잔량 뱃지
- **페이딩 궤적선 (Gradient Trail)**: 직관성을 위해 이전 경로는 반투명 점선으로 흐려지고, 최신 주행 궤적선만 선명하게 강조
- **지도 스타일 전환**: CartoDB Voyager(기본) / Light / Dark 모드 지원

### 3. 과거 경로 조회 및 타임라인 재생 (Playback)
- 날짜별 캘린더 선택 (오늘, 어제, 이전 기록)
- 00:00 ~ 23:59 시간대별 타임 슬라이더 탐색
- 재생/일시정지, 배속 조절 (1x, 2x, 5x 배속)
- 구간별 주요 정차 지점(P 마커) 및 체류 시간 표시

### 4. 안전구역 (지오펜스) 시각화 및 관리
- 지도 위 원형(Circle) 안심존 표시
- 반경 거리(100m ~ 1,500m) 슬라이더 조절
- 진입(Entry) 및 이탈(Exit) 시 즉시 경보 발송

### 5. 사운드 효과 및 실시간 알림 센터
- **Web Audio API 내장 합성**: 별도 음원 파일 없이 브라우저에서 '삐-삐- 비프음(트래커 찾기)', 'SOS 긴급 사이렌', '안심존 진입 알림음' 즉각 재생
- 실시간 토스트 알림 팝업 및 알림 히스토리 서랍(Drawer)

### 6. 내장 GPS 시뮬레이터 (Standalone Simulator)
- 서울 주요 도심(대치동 학원가, 잠원 한강공원, 테헤란로~판교) 현실적인 이동 경로 내장
- 실제 기기가 연결되지 않아도 브라우저 자체에서 GPS 핑이 실시간으로 수신되며 지오펜스 충돌 판정 작동

---

## 🚀 깃허브(GitHub) 배포 방법 (노트북 꺼져도 24시간 접속 가능!)

본 프로젝트는 **정적 단일 페이지 애플리케이션(SPA)**으로 최적화되어 있어, **GitHub Pages**에 배포하면 개인 서버나 노트북을 켜둘 필요 없이 언제 어디서나 스마트폰과 PC에서 무료로 24시간 접속할 수 있습니다.

### 1단계: GitHub에 새 저장소(Repository) 생성
1. [GitHub.com](https://github.com/)에 로그인 후 우측 상단의 **[+] → [New repository]** 클릭
2. Repository name 입력 (예: `navix-gps-tracker`)
3. **Public** 선택 후 **[Create repository]** 클릭

### 2단계: 터미널에서 코드 푸시 (Push)
프로젝트 폴더(`C:\Users\hyun6\.gemini\antigravity\scratch\gps-tracker-nabix`)에서 아래 명령어를 실행합니다:

```bash
# 1. 깃 저장소 초기화 및 커밋 (이미 완료되어 있습니다)
git add .
git commit -m "feat: NAVIX GPS tracker web platform initial release"

# 2. 본인의 GitHub 저장소 주소 연결 (본인 아이디와 저장소 이름으로 변경)
git remote add origin https://github.com/<본인_아이디>/<저장소_이름>.git

# 3. 메인 브랜치 설정 및 푸시
git branch -M main
git push -u origin main
```

### 3단계: GitHub Pages 활성화 (1회 설정)
1. GitHub 저장소 상단 탭에서 **[Settings]** 클릭
2. 좌측 메뉴의 **[Pages]** 클릭
3. **Build and deployment > Source** 항목을 **`GitHub Actions`**로 선택!
4. 상단 **[Actions]** 탭으로 가면 배포 워크플로우가 자동으로 실행되며, 약 1분 후 웹사이트 주소가 생성됩니다.

> 🎉 **배포 완료 URL:**  
> `https://<본인_아이디>.github.io/<저장소_이름>/`  
> 이제 이 주소를 스마트폰 홈 화면에 추가하면 전용 앱처럼 사용할 수 있습니다!

---

## 🛠️ 기술 스택
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React
- **Map Engine**: Leaflet, CartoDB Voyager High-DPI Tiles
- **Audio**: Web Audio API Sound Synthesizer
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`)
