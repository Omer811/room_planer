#!/usr/bin/env bash
set -euo pipefail

# Create README media (MP4 + GIF + thumbnails) from a screen recording.
#
# Usage:
#   bash scripts/make-media.sh path/to/recording.mov
#
# Env vars (optional):
#   START=00:00:00   # trim start timestamp
#   DURATION=0       # seconds to keep; 0 or unset = full video
#   WIDTH=800        # target width for GIF/MP4 (height auto, preserves AR)
#   FPS=18           # GIF frame rate
#   SNAP_OFFSET=auto # seconds after START to grab thumbnails; 'auto' uses mid-frame
#   CROP=WxH:X:Y     # optional crop filter, e.g. 1200:700:100:80
#   GIFSICLE=1       # if set and gifsicle found, run extra optimization

INPUT=${1:-}
if [[ -z "${INPUT}" || ! -f "${INPUT}" ]]; then
  echo "Usage: bash scripts/make-media.sh path/to/recording.mov" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found in PATH. Install ffmpeg and retry." >&2
  exit 1
fi

START=${START:-00:00:00}
DURATION=${DURATION:-0}
WIDTH=${WIDTH:-800}
FPS=${FPS:-18}
SNAP_OFFSET=${SNAP_OFFSET:-auto}

mkdir -p docs

# Build filter chains
# 1) Normalize video for MP4: gen PTS, fps, optional crop, scale, set SAR
VF_MP4="setpts=PTS-STARTPTS,fps=${FPS}"
if [[ -n "${CROP:-}" ]]; then
  VF_MP4="${VF_MP4},crop=${CROP}"
fi
VF_MP4="${VF_MP4},scale=${WIDTH}:-2:flags=lanczos,setsar=1"

# 2) GIF pipeline: normalize PTS, fps, optional crop, scale, palette
VF="setpts=PTS-STARTPTS,fps=${FPS}"
if [[ -n "${CROP:-}" ]]; then
  VF="${VF},crop=${CROP}"
fi
VF="${VF},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"

echo "[media] Generating docs/preview.gif (start=${START}, duration=${DURATION}s, width=${WIDTH}, fps=${FPS})"
if [[ "${DURATION}" == "0" || -z "${DURATION}" ]]; then
  if [[ -n "${DEBUG:-}" ]]; then
    ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -an -vf "${VF}" -vsync 0 -loop 0 docs/preview.gif
  else
    ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -an -vf "${VF}" -vsync 0 -loop 0 docs/preview.gif >/dev/null 2>&1
  fi
else
  if [[ -n "${DEBUG:-}" ]]; then
    ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -t "${DURATION}" -an -vf "${VF}" -vsync 0 -loop 0 docs/preview.gif
  else
    ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -t "${DURATION}" -an -vf "${VF}" -vsync 0 -loop 0 docs/preview.gif >/dev/null 2>&1
  fi
fi

if [[ -n "${GIFSICLE:-}" ]] && command -v gifsicle >/dev/null 2>&1; then
  echo "[media] Optimizing GIF with gifsicle"
  gifsicle -O3 --lossy=30 --colors 128 -o docs/preview.gif docs/preview.gif || true
fi

# Also generate an MP4 for direct embedding (smaller, smoother)
echo "[media] Generating docs/preview.mp4 (start=${START}, duration=${DURATION}s, width=${WIDTH}, fps=${FPS})"
if [[ "${DURATION}" == "0" || -z "${DURATION}" ]]; then
  ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -an -vf "${VF_MP4}" -r ${FPS} -pix_fmt yuv420p -movflags +faststart docs/preview.mp4 >/dev/null 2>&1
else
  ffmpeg -y -ss "${START}" -fflags +genpts -i "${INPUT}" -t "${DURATION}" -an -vf "${VF_MP4}" -r ${FPS} -pix_fmt yuv420p -movflags +faststart docs/preview.mp4 >/dev/null 2>&1
fi

# Compute snapshot time (auto = middle of clip)
SNAP_TS="${START}"
if [[ "${SNAP_OFFSET}" == "auto" ]]; then
  if command -v ffprobe >/dev/null 2>&1; then
    DUR_SEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=nw=1:nk=1 "${INPUT}" 2>/dev/null | head -n1 || true)
    # If stream duration is N/A, try container duration
    if [[ -z "${DUR_SEC}" || "${DUR_SEC}" == "N/A" ]]; then
      DUR_SEC=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${INPUT}" 2>/dev/null | head -n1 || true)
    fi
    # Keep only integer seconds if numeric
    if [[ "${DUR_SEC}" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
      DUR_INT=${DUR_SEC%.*}
    else
      DUR_INT=10
    fi
    MID=$(( DUR_INT / 2 ))
    SNAP_TS=$(printf '%02d:%02d:%02d' $((MID/3600)) $(((MID%3600)/60)) $((MID%60)))
  fi
else
  if command -v python3 >/dev/null 2>&1; then
    SNAP_TS=$(python3 - <<PY
from datetime import datetime, timedelta
start='${START}'
try:
  offset=float('${SNAP_OFFSET}')
  t=datetime.strptime(start,'%H:%M:%S')+timedelta(seconds=offset)
  print(t.strftime('%H:%M:%S'))
except Exception:
  print(start)
PY
    )
  fi
fi

VF_THUMB="scale=1200:630:force_original_aspect_ratio=decrease,pad=1200:630:(ow-iw)/2:(oh-ih)/2"
[[ -n "${CROP:-}" ]] && VF_THUMB="crop=${CROP},${VF_THUMB}"
echo "[media] Creating docs/cover-1200x630.png @ ${SNAP_TS}"
ffmpeg -y -i "${INPUT}" -ss "${SNAP_TS}" -vframes 1 -vf "${VF_THUMB}" docs/cover-1200x630.png >/dev/null 2>&1

VF_THUMB_SM="scale=600:400:force_original_aspect_ratio=decrease,pad=600:400:(ow-iw)/2:(oh-ih)/2"
[[ -n "${CROP:-}" ]] && VF_THUMB_SM="crop=${CROP},${VF_THUMB_SM}"
echo "[media] Creating docs/thumb-600x400.png @ ${SNAP_TS}"
ffmpeg -y -i "${INPUT}" -ss "${SNAP_TS}" -vframes 1 -vf "${VF_THUMB_SM}" docs/thumb-600x400.png >/dev/null 2>&1

echo "[media] Done. Files: docs/preview.gif, docs/cover-1200x630.png, docs/thumb-600x400.png"
