#!/bin/bash
# deploy.sh — Build and reload the board-web Next.js service.
#
# Launch pattern: `next start` (NOT standalone/server.js).
# The plist at ~/Library/LaunchAgents/com.miniclaw.board-web.plist uses:
#   /path/to/node /path/to/next start -p 4220
# with WorkingDirectory set to the web plugin root.
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
