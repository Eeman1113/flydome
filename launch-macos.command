#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=8000
cd "$ROOT"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the other process or change PORT in this file."
  read -r -p "Press Enter to close..."
  exit 1
fi
python3 -m http.server "$PORT" >/tmp/skybound-flight-sim-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
open "http://localhost:$PORT"
echo "SKYBOUND is running at http://localhost:$PORT"
echo "Keep this Terminal window open while playing. Press Ctrl+C to stop the local server."
wait "$SERVER_PID"
