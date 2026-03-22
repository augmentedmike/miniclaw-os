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

# ── Drift detection ──────────────────────────────────────────────────────────
# Compare live plugins dir against the source repo to catch direct-write drift.
REPO_SRC="$HOME/.openclaw/projects/miniclaw-os/plugins/mc-board/web/src"
LIVE_SRC="$DIR/src"
if [ -d "$REPO_SRC" ]; then
  DRIFT=$(diff -rq "$REPO_SRC" "$LIVE_SRC" \
    --exclude='node_modules' --exclude='.next' --exclude='*.log' 2>/dev/null \
    | grep -E '\.(tsx?|ts)' | head -10 || true)
  if [ -n "$DRIFT" ]; then
    echo ""
    echo "⚠️  DRIFT DETECTED — live plugins dir differs from repo:"
    echo "$DRIFT"
    echo ""
    echo "Run: ~/.openclaw/projects/miniclaw-os/scripts/sync-dev.sh"
    echo "Or manually resolve differences before deploying."
    echo ""
  fi
fi

node node_modules/next/dist/bin/next build .

launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist 2>/dev/null || true
sleep 1
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.miniclaw.board-web.plist
echo "deployed"
