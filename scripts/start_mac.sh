#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

flags=(up -d --wait)
open_browser=1
for arg in "$@"; do
  case "$arg" in
    --build) flags+=(--build) ;;
    --no-open) open_browser=0 ;;
    *) echo "Usage: scripts/start_mac.sh [--build] [--no-open]"; exit 2 ;;
  esac
done

docker compose "${flags[@]}"

port=$(docker compose port finally 8000 | head -n1)
url="http://localhost:${port##*:}"
[ -f .env ] || echo "No .env found: AI chat needs OPENROUTER_API_KEY in .env."
echo "FinAlly is running at $url"

if [ "$open_browser" = 1 ]; then
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url"
  fi
fi
