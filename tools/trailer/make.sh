#!/usr/bin/env bash
# 트레일러 전체 제작: 빌드 → 프레임 촬영 → 사운드 합성 → mp4 인코딩
#   bash tools/trailer/make.sh [출력.mp4] [fps]
# 헤드리스 Chromium(소프트웨어 렌더) 기준 1280x720 한 프레임에 1~4초 걸린다.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-trailer.mp4}"
FPS="${2:-30}"
WORK="${TR_WORK:-$(mktemp -d)}"
npm run build
node tools/trailer/record.cjs "$WORK/frames" "$FPS" 1280 720
python3 tools/trailer/audio.py "$WORK/frames/events.json" "$WORK/audio.wav"
ffmpeg -y -framerate "$FPS" -i "$WORK/frames/f%05d.jpg" -i "$WORK/audio.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "trailer: $OUT"
