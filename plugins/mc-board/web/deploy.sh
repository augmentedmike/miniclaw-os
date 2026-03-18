#!/usr/bin/env bash
set -euo pipefail

# Build and deploy the mc-board web app to the live service
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$HOME/.openclaw/miniclaw/plugins/mc-board/web"
SERVICE="com.miniclaw.board-web"

echo "→ Building..."
cd "$SCRIPT_DIR"
npm run build

# Symlink .next so no copy needed
if [ ! -L "$DEPLOY_DIR/.next" ]; then
  echo "→ Symlinking .next..."
  rm -rf "$DEPLOY_DIR/.next"
  ln -s "$SCRIPT_DIR/.next" "$DEPLOY_DIR/.next"
fi

echo "→ Restarting $SERVICE..."
launchctl kickstart -k "gui/$(id -u)/$SERVICE"

echo "✓ Done"
