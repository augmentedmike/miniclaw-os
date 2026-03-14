#!/usr/bin/env bash
# clean.sh — nuke all miniclaw/openclaw state for a fresh install test
#
# Usage:
#   ./scripts/clean.sh          # moves ~/.openclaw to backup
#   ./scripts/clean.sh --hard   # deletes ~/.openclaw entirely
set -euo pipefail

HARD=false
[[ "${1:-}" == "--hard" ]] && HARD=true

echo "Cleaning miniclaw/openclaw..."

# 1. Stop services
echo "  Stopping services..."
launchctl unload ~/Library/LaunchAgents/com.miniclaw.* 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/ai.openclaw.* 2>/dev/null || true

# 2. Kill processes
echo "  Killing processes..."
for port in 4210 4220; do
  for pid in $(lsof -ti ":$port" 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null || true
  done
done
pkill -f "openclaw gateway" 2>/dev/null || true

# 3. Remove LaunchAgents
echo "  Removing LaunchAgents..."
rm -f ~/Library/LaunchAgents/com.miniclaw.*
rm -f ~/Library/LaunchAgents/ai.openclaw.*

# 4. Remove state dir
if [[ -d "$HOME/.openclaw" ]]; then
  if $HARD; then
    echo "  Deleting ~/.openclaw..."
    rm -rf "$HOME/.openclaw"
  else
    BACKUP="$HOME/.openclaw-backup-$(date +%Y%m%d-%H%M%S)"
    echo "  Moving ~/.openclaw → $BACKUP"
    mv "$HOME/.openclaw" "$BACKUP"
  fi
else
  echo "  ~/.openclaw already gone"
fi

# 5. Uninstall openclaw from all Node versions
echo "  Uninstalling openclaw..."
npm uninstall -g @miniclaw_official/openclaw 2>/dev/null || true
npm uninstall -g openclaw 2>/dev/null || true
# Also try NVM nodes and homebrew node
for node_dir in "$HOME/.nvm/versions/node"/*/bin "$HOME/.volta/bin" /opt/homebrew/bin /usr/local/bin; do
  [[ -x "$node_dir/npm" ]] && "$node_dir/npm" uninstall -g @miniclaw_official/openclaw 2>/dev/null || true
  [[ -x "$node_dir/npm" ]] && "$node_dir/npm" uninstall -g openclaw 2>/dev/null || true
done

# 6. Clean install log
rm -f /tmp/miniclaw-install.log /tmp/miniclaw-bootstrap.log

echo "✓ Clean. Ready for fresh install."
