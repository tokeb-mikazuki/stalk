#!/usr/bin/env bash
# 안드로이드 APK 빌드: 두 판을 빌드하고 → android/ 의 WebView 앱에 넣어 →
#   dist/songshin-stairwell.apk (공포의 송신계단) / dist/channel-yugi.apk (공포의 채널유기) 로 내보낸다.
# 필요: JDK 17+, Android SDK (ANDROID_HOME 또는 android/local.properties 의 sdk.dir)
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
(cd android && ./gradlew assembleRelease --no-daemon -q)
cp android/app/build/outputs/apk/songshin/release/app-songshin-release.apk dist/songshin-stairwell.apk
cp android/app/build/outputs/apk/yugi/release/app-yugi-release.apk dist/channel-yugi.apk
for f in dist/songshin-stairwell.apk dist/channel-yugi.apk; do echo "[apk] $f ($(du -k "$f" | cut -f1) KB)"; done
