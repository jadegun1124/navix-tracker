# AGENTS.md - 시스템 기술 스택 및 개발 규칙

## 1. 기술 스택
- **프레임워크**: React 19 + TypeScript + Vite
- **스타일링**: Tailwind CSS v4 (모바일 퍼스트 반응형 레이아웃)
- **지도 엔진**: Leaflet + OpenStreetMap / CartoDB Voyager High-DPI 타일
- **아이콘**: Lucide-react (모던 미니멀 벡터 아이콘)
- **사운드**: Web Audio API (외부 mp3 파일 종속성 없는 내장 오실레이터 합성)
- **배포 타깃**: GitHub Pages (정적 호스팅, Vite base: './' 상대 경로) + GitHub Actions CI/CD

## 2. 프로젝트 디렉토리 구조
```
C:\Users\hyun6\.gemini\antigravity\scratch\gps-tracker-nabix\
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages 자동 배포 파이프라인
├── src/
│   ├── components/
│   │   ├── Map/
│   │   │   ├── MapView.tsx     # 메인 Leaflet 맵 & 마커 & 궤적 렌더링
│   │   │   └── MapControls.tsx # 맵 레이어, 줌, 내 위치 포커스
│   │   ├── Device/
│   │   │   ├── DeviceCard.tsx  # 기기 카드 (배터리, 통신, 상태)
│   │   │   ├── DeviceList.tsx  # 기기 목록 패널
│   │   │   ├── DeviceRegisterModal.tsx # QR/시리얼 기기 등록 모달
│   │   │   └── TargetThemeView.tsx     # 대상별(등하교, 산책, 운행일지) 전용 뷰
│   │   ├── Playback/
│   │   │   └── RoutePlaybackModal.tsx  # 과거 날짜별 궤적 재생 & 슬라이더
│   │   ├── Geofence/
│   │   │   └── GeofenceModal.tsx       # 지오펜스(안전구역) 관리 & 반경 조절
│   │   ├── Notification/
│   │   │   └── NotificationDrawer.tsx  # 실시간 알림 센터 & 토스트
│   │   └── Layout/
│   │       ├── Header.tsx      # 상단 네비게이션 & 빠른 기기 전환
│   │       ├── BottomSheet.tsx # 모바일 바텀시트
│   │       └── Sidebar.tsx     # 데스크톱 사이드바
│   ├── data/
│   │   └── mockData.ts         # 현실적인 서울 도심 이동 경로 및 프리셋 기기
│   ├── services/
│   │   └── simulation.ts       # 실시간 GPS 시뮬레이터 & 지오펜스 충돌 판정
│   ├── types/
│   │   └── index.ts            # 기기, 지오펜스, 좌표 타입 정의
│   ├── utils/
│   │   └── audio.ts            # 비프음, 경보음, 알림음 사운드 신시사이저
│   ├── App.tsx                 # 최상위 상태 관리 및 컴포넌트 조합
│   └── main.tsx
├── PRD.md                      # 제품 요구 명세서
├── AGENTS.md                   # 기술 스택 및 코딩 규칙
└── README.md                   # 깃허브 배포 가이드
```

## 3. 코딩 및 품질 규칙
1. **Zero External Server Dependency**:
   - 브라우저 환경에서 완전히 독립 실행(Self-contained) 가능해야 함.
   - GitHub Pages에 배포했을 때 노트북이 꺼져 있어도 스마트폰 등에서 즉시 동작해야 함.
2. **모바일 퍼스트 UX**:
   - 모바일 환경에서는 지도 전체 화면 위에 하단 시트(Bottom Sheet)가 오버레이됨.
   - 데스크톱 환경에서는 좌측 제어 사이드바 + 우측 전체 지도로 전환.
3. **부드러운 애니메이션 및 시각적 위계**:
   - 현재 위치 마커는 부드러운 펄스(Pulse) 파동 효과.
   - 이동 궤적선은 최신 구간이 굵고 선명하며, 과거 구간은 페이드아웃.
4. **실시간 시뮬레이션 인터랙션**:
   - 재생 속도(1x, 2x, 5x, 10x) 조절 가능.
   - 실제 이동 중 안전구역 진입/이탈 시 알림 팝업 및 Web Audio 알림음 즉각 반응.
