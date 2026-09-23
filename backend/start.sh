#!/bin/sh
# Runs the API and the WhatsApp sidecar together. If either dies the container
# should die too — a half-running service that answers health checks while
# WhatsApp is silently dead is worse than an honest restart.
set -e

if [ -z "$BOT_TOKEN" ]; then
  echo "BOT_TOKEN is not set. The sidecar refuses to run unauthenticated." >&2
  exit 1
fi

mkdir -p "${DATA_DIR:-/data}/wa"

cd /app/bot
node index.js &
BOT_PID=$!

cd /app
uv run uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" &
API_PID=$!

# Exit as soon as either one stops, so the platform restarts the whole thing.
wait -n "$BOT_PID" "$API_PID"
EXIT=$?
echo "a process exited ($EXIT) — shutting down the container" >&2
kill "$BOT_PID" "$API_PID" 2>/dev/null || true
exit "$EXIT"
