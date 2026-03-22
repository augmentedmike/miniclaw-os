#!/bin/bash
# deploy.sh — Build and reload the board-web Next.js service.
#
# Launch pattern: `next start` (NOT standalone/server.js).
# Plists are generated from .plist.template files via install-plists.sh.
# Run install-plists.sh first if plists are not yet in ~/Library/LaunchAgents/.
# next.config.ts must NOT have output: "standalone" — that mode is incompatible
# with this launch pattern and caused crash-loops in the past.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

node node_modules/next/dist/bin/next build .

launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist 2>/dev/null || true
sleep 1
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist
echo "deployed"
