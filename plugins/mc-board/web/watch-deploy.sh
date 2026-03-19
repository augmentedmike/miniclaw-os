#!/bin/bash
# watch-deploy.sh — Watch mc-board web source files and auto-deploy on changes
# Uses fswatch with debounce to detect changes, then runs deploy.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LOG_DIR="$HOME/.openclaw/logs"
LOG_FILE="$LOG_DIR/board-web-watcher.log"
DEPLOY_SCRIPT="$DIR/deploy.sh"
COOLDOWN=3  # seconds between deploys

mkdir -p "$LOG_DIR"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" | tee -a "$LOG_FILE"
}

log "Watcher starting — monitoring $DIR for changes"
log "Watching: src/, public/, next.config.ts, package.json"
log "Ignoring: .next/, node_modules/, .git/"
log "Debounce latency: ${COOLDOWN}s"

# fswatch flags:
#   --recursive: watch directories recursively
#   --latency 3: debounce — batch events within 3-second windows
#   --one-per-batch: emit one event per batch (not one per file)
#   --exclude: ignore build artifacts and deps
fswatch \
  --recursive \
  --latency "$COOLDOWN" \
  --one-per-batch \
  --exclude '\.next' \
  --exclude 'node_modules' \
  --exclude '\.git' \
  --exclude '\.swp$' \
  --exclude '\.DS_Store' \
  "$DIR/src" \
  "$DIR/public" \
  "$DIR/next.config.ts" \
  "$DIR/package.json" \
  | while read -r event; do
    log "Change detected — starting deploy..."
    if bash "$DEPLOY_SCRIPT" >> "$LOG_FILE" 2>&1; then
      log "Deploy completed successfully"
    else
      log "Deploy FAILED (exit code $?)"
    fi
  done
