#!/usr/bin/env bash
# 안드로이드 APK 빌드: 게임을 빌드하고 → android/ 의 WebView 앱에 넣어 → dist/songshin-stairwell.apk 로 내보낸다.
# 필요: JDK 17+, Android SDK (ANDROID_HOME 또는 android/local.properties 의 sdk.dir)
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
(cd android && ./gradlew assembleRelease --no-daemon -q)
cp android/app/build/outputs/apk/release/app-release.apk dist/songshin-stairwell.apk
echo "[apk] dist/songshin-stairwell.apk ($(du -k dist/songshin-stairwell.apk | cut -f1) KB)"
