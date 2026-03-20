#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

node node_modules/next/dist/bin/next build .
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist 2>/dev/null || true
sleep 1
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist
echo "deployed"
