@echo off
chcp 65001 >nul
title umap - 안드로이드 APK 빌드 스크립트

echo ========================================================
echo   🛰️ umap 안드로이드 전용 APK 빌드 마법사
echo ========================================================
echo.

set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

echo [1/3] 최신 웹 소스 빌드 및 Capacitor 동기화 중...
call npm.cmd run build
call npx.cmd cap sync android

echo.
echo [2/3] 안드로이드 프로젝트 빌드 확인...
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
    )
)

if "%ANDROID_HOME%"=="" (
    echo [안내] 로컬 컴퓨터에 Android SDK가 설정되어 있지 않습니다.
    echo.
    echo 🌟 가장 간편한 방법:
    echo 깃허브에 푸시(git push)하시면 GitHub Actions 클라우드에서
    echo 2분 만에 자동으로 정품 APK 파일이 빌드되어 다운로드 링크가 생성됩니다!
    echo.
    echo 또는 'Android Studio'를 설치하시면 이 컴퓨터에서도 바로 빌드됩니다.
    echo.
) else (
    echo [3/3] Gradle을 통해 APK 빌드 시작...
    cd android
    call gradlew.bat assembleDebug
    cd ..
    if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
        copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "umap-tracker.apk"
        echo.
        echo ========================================================
        echo   🎉 APK 빌드 완료: umap-tracker.apk
        echo ========================================================
    )
)

pause
