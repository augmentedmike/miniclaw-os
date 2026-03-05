#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

node node_modules/next/dist/bin/next build .
cp -r .next/static .next/standalone/web/.next/static
cp -r public .next/standalone/web/public

launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist 2>/dev/null || true
sleep 1
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist
echo "deployed"
