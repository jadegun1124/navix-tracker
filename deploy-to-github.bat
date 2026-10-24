@echo off
chcp 65001 >nul
title umap - 깃허브 배포 마법사 (GitHub Deployment Wizard)

echo ============================================================
echo   🛰️ umap (유맵) 깃허브 원클릭 배포 스크립트
echo ============================================================
echo.
echo [안내] GitHub에 이미 생성해 두신 저장소(Repository) 주소가 필요합니다.
echo 예시: https://github.com/내아이디/umap-gps.git
echo.
set /p REPO_URL="깃허브 저장소 주소를 붙여넣고 엔터를 누르세요 (없으면 엔터): "

echo.
echo [1/3] 변경 사항 스테이징 및 커밋 중...
git add .
git commit -m "feat: complete umap high-accuracy mobile GPS tracker with 4 filtering algorithms"

if "%REPO_URL%"=="" (
    echo.
    echo [알림] 저장소 주소를 입력하지 않았습니다.
    echo 기존에 연결된 원격 저장소(origin)로 푸시를 시도합니다...
    git push -u origin main
) else (
    echo.
    echo [2/3] 원격 저장소 연결 중 (%REPO_URL%)...
    git remote remove origin 2>nul
    git remote add origin %REPO_URL%
    git branch -M main
    echo [3/3] 깃허브로 푸시 중...
    git push -u origin main
)

echo.
echo ============================================================
echo   ✅ 깃허브 업로드가 완료되었습니다!
echo ============================================================
echo.
echo 이제 깃허브 저장소 웹페이지에서 다음 설정을 진행하세요:
echo 1. 저장소 상단의 [Settings] 클릭
echo 2. 좌측 메뉴의 [Pages] 클릭
echo 3. Build and deployment > Source 항목을 [GitHub Actions]로 선택!
echo 4. 약 1분 후 https://아이디.github.io/저장소이름/ 주소로 24시간 접속 가능합니다.
echo.
pause
