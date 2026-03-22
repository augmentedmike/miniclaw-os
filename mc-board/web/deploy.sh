#!/bin/bash
# deploy.sh — Build and reload the board-web Next.js service.
#
# Safe deploy: stops the server first, builds in-place, then restarts.
# The server is down during the build (~5-10s) but there's no risk of
# serving stale chunks or the watcher nuking a live .next directory.
# If the build fails, the old .next is preserved and the server restarts
# with the previous build.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"
UID_NUM=$(id -u)

# Stop the server FIRST — no more serving stale chunks during build
launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
sleep 1

# Back up the current build in case this one fails
if [ -d .next ]; then
  rm -rf .next-backup
  cp -a .next .next-backup
fi

# Build in-place — server is stopped so no conflict
if node node_modules/next/dist/bin/next build .; then
  # Build succeeded — clean up backup
  rm -rf .next-backup
else
  # Build failed — restore backup
  echo "BUILD FAILED — restoring previous build"
  if [ -d .next-backup ]; then
    rm -rf .next
    mv .next-backup .next
  fi
fi

# Start the server (with new or restored build)
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

echo "deployed"
