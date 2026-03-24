#!/bin/bash
# install-plists.sh — Render plist templates and install to ~/Library/LaunchAgents/
#
# Detects HOME, node binary, and plugin directory automatically.
# Substitutes __HOME__, __NODE_BIN__, __NODE_BIN_DIR__, __PLUGIN_DIR__ placeholders
# in .plist.template files, writes rendered plists, and loads them via launchctl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# PLUGIN_DIR must always resolve to the LIVE install location, never a repo clone.
# The live install is at ~/.openclaw/miniclaw/plugins/mc-board/web/
# If this script is run from a repo clone (e.g. USER/projects/miniclaw-os/...),
# using $SCRIPT_DIR would produce wrong paths in the plist.
PLUGIN_DIR="$HOME/.openclaw/miniclaw/plugins/mc-board/web"
if [ ! -d "$PLUGIN_DIR" ]; then
  echo "ERROR: Live plugin dir not found at $PLUGIN_DIR" >&2
  echo "  (script ran from: $SCRIPT_DIR)" >&2
  exit 1
fi
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

# --- Detect node binary ---
NODE_BIN=""
if command -v node &>/dev/null; then
  NODE_BIN="$(command -v node)"
elif [ -d "$HOME/.nvm" ]; then
  # Source nvm and get node path
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if command -v node &>/dev/null; then
    NODE_BIN="$(command -v node)"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Cannot find node binary. Install Node.js or configure nvm." >&2
  exit 1
fi

NODE_BIN_DIR="$(dirname "$NODE_BIN")"

echo "Configuration:"
echo "  HOME:         $HOME"
echo "  NODE_BIN:     $NODE_BIN"
echo "  NODE_BIN_DIR: $NODE_BIN_DIR"
echo "  PLUGIN_DIR:   $PLUGIN_DIR"
echo ""

# --- Ensure LaunchAgents dir exists ---
mkdir -p "$LAUNCH_AGENTS_DIR"

# --- Render and install each template ---
render_template() {
  local template="$1"
  local basename="$(basename "$template" .template)"
  local output="$LAUNCH_AGENTS_DIR/$basename"

  echo "Rendering $basename..."
  sed \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    -e "s|__NODE_BIN_DIR__|$NODE_BIN_DIR|g" \
    -e "s|__PLUGIN_DIR__|$PLUGIN_DIR|g" \
    "$template" > "$output"

  echo "  Written to $output"

  # Reload the service
  local label="$(basename "$basename" .plist)"
  echo "  Reloading $label..."
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  sleep 1
  launchctl bootstrap "gui/$UID_NUM" "$output"
  echo "  Loaded $label"
}

for tmpl in "$SCRIPT_DIR"/*.plist.template; do
  [ -f "$tmpl" ] || continue
  render_template "$tmpl"
done

echo ""
echo "Done. Both services installed and loaded."
