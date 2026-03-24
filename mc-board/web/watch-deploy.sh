#!/bin/bash
# watch-deploy.sh — Watch mc-board web source files and auto-deploy on changes
# Uses fswatch with debounce to detect changes, then runs deploy.sh
# Uses a lock file to prevent concurrent deploys
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LOG_DIR="$HOME/.openclaw/logs"
LOG_FILE="$LOG_DIR/board-web-watcher.log"
DEPLOY_SCRIPT="$DIR/deploy.sh"
LOCK_FILE="$DIR/.deploy.lock"
COOLDOWN=3  # seconds between deploys

mkdir -p "$LOG_DIR"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" | tee -a "$LOG_FILE"
}

log "Watcher starting — monitoring $DIR for changes"
log "Watching: src/, public/, next.config.ts, package.json"
log "Ignoring: .next/, .next-backup/, node_modules/, .git/, deploy.sh, watch-deploy.sh"
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
  --exclude 'deploy\.sh' \
  --exclude 'watch-deploy\.sh' \
  --exclude '\.deploy\.lock' \
  "$DIR/src" \
  "$DIR/public" \
  "$DIR/next.config.ts" \
  "$DIR/package.json" \
  | while read -r event; do
    # Skip if a deploy is already running
    if [ -f "$LOCK_FILE" ]; then
      log "Change detected — deploy already running, skipping"
      continue
    fi

    log "Change detected — starting deploy..."
    touch "$LOCK_FILE"
    if bash "$DEPLOY_SCRIPT" >> "$LOG_FILE" 2>&1; then
      log "Deploy completed successfully"
    else
      log "Deploy FAILED (exit code $?)"
    fi
    rm -f "$LOCK_FILE"
  done
