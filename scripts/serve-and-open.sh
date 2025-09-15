#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/tests/runner.html"

open_url() {
  if command -v open >/dev/null 2>&1; then
    # Prefer Google Chrome on macOS if installed
    if open -Ra "Google Chrome" >/dev/null 2>&1; then
      open -a "Google Chrome" "$1" || open "$1" || true
    else
      open "$1" || true
    fi
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" || true
  else
    echo "Open this URL in your browser: $1"
  fi
}

echo "[serve] Starting on http://localhost:${PORT}"
( sleep 1; open_url "$URL" ) &

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
else
  echo "Python not found. Install Python 3 or run a static server."
  exit 1
fi
