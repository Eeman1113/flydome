#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org and run this again."
  read -r -p "Press Enter to close..."
  exit 1
fi
[ -d node_modules ] || npm install
(sleep 4 && open "http://localhost:3000") &
echo "SKYBOUND is starting at http://localhost:3000 — keep this window open while playing."
npm run dev
