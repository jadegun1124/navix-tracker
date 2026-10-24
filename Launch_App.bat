@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   umap (유맵) - 실시간 GPS & 010 핸드폰 위치 궤적 관제
echo   독립 데스크톱 전용 윈도우 실행 중...
echo ========================================================

:: 1. Edge & Chrome Browser 경로 탐색 (단독 앱 창 모드)
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_PATH% set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

:: 2. 로컬 서버 상태 점검
curl -s -o nul http://localhost:5173/
if errorlevel 1 (
    echo [안내] 로컬 서버를 백그라운드에서 시작합니다...
    start /min "" cmd /c "npm.cmd run dev -- --host"
    timeout /t 2 /nobreak > nul
)

:: 3. 전용 단독 창(App Mode)으로 열기
if exist %EDGE_PATH% (
    echo Microsoft Edge 단독 앱 모드로 실행합니다.
    start "" %EDGE_PATH% --app="http://localhost:5173/" --window-size=1400,900
    exit /b
)

if exist %CHROME_PATH% (
    echo Google Chrome 단독 앱 모드로 실행합니다.
    start "" %CHROME_PATH% --app="http://localhost:5173/" --window-size=1400,900
    exit /b
)

:: 4. 기본 브라우저로 열기
echo 기본 브라우저로 실행합니다.
start "" "http://localhost:5173/"
