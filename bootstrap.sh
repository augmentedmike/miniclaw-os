#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
INSTALL_DIR="${HOME}/.openclaw/miniclaw/USER/projects/miniclaw-os"
STATE_DIR="${HOME}/.openclaw"
WEB_DIR="$STATE_DIR/web"
APP_PORT=4220
LOG_FILE="/tmp/miniclaw-bootstrap.log"
ZIP_URL="https://github.com/augmentedmike/miniclaw-os/releases/download/v0.1.7-installer/MiniClaw-Installer-v0.1.7.zip"

# Detect if running from .app bundle vs curl|bash
IS_APP=false
[[ "${0}" == *".app/"* || "${BASH_SOURCE[0]:-}" == *".app/"* ]] && IS_APP=true

# Hide Terminal only when running from .app
$IS_APP && osascript -e 'tell application "Terminal" to set visible of front window to false' 2>/dev/null &

echo ""
echo "  🦀 MiniClaw"
echo "  Setting up..."
echo ""

# ── macOS check ──────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || exit 1

# ── Get sudo ─────────────────────────────────────────────────────────────────
if ! sudo -n true 2>/dev/null; then
  if $IS_APP; then
    # Native dialog for .app
    for attempt in 1 2 3; do
      PW=$(osascript -e '
        tell current application to activate
        display dialog "MiniClaw needs your Mac password to finish setting up." & return & return & "Your password is only used locally and is never stored." default answer "" with hidden answer with title "MiniClaw Setup" with icon caution buttons {"Cancel", "OK"} default button "OK"
        text returned of result
      ' 2>/dev/null) || exit 0
      [[ -z "$PW" ]] && continue
      echo "$PW" | sudo -S true 2>/dev/null && break
      osascript -e 'display dialog "Incorrect password." with title "MiniClaw" buttons {"OK"} default button "OK" with icon stop' 2>/dev/null
    done
  else
    # Terminal prompt
    echo "  Enter your Mac password:"
    sudo -v || exit 1
  fi
  ( while true; do sudo -n true 2>/dev/null; sleep 50; kill -0 $$ 2>/dev/null || exit; done ) &
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.bun/bin:$PATH"
[[ -f "$HOME/.zshenv" ]] && source "$HOME/.zshenv" 2>/dev/null || true
BREW_PREFIX=$([[ "$(uname -m)" == "arm64" ]] && echo "/opt/homebrew" || echo "/usr/local")

if ! command -v node &>/dev/null; then
  echo "  Installing Node.js..."
  if [[ ! -x "$BREW_PREFIX/bin/brew" ]]; then
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" >>"$LOG_FILE" 2>&1
    eval "$($BREW_PREFIX/bin/brew shellenv)"
  fi
  brew install node@22 >>"$LOG_FILE" 2>&1
  export PATH="$BREW_PREFIX/opt/node@22/bin:$PATH"
fi

NODE_BIN=$(which node 2>/dev/null || echo "$BREW_PREFIX/opt/node@22/bin/node")

# ── Evacuate existing install ────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  mv "$INSTALL_DIR" "${INSTALL_DIR}.previous-$(date +%Y%m%d-%H%M%S)"
fi

# ── Download and extract pre-built web app ───────────────────────────────────
# ── Download pre-built app (13MB) ─────────────────────────────────────────────
echo "  Downloading (~113MB)..."
ZIP_TMP="/tmp/miniclaw-installer-$$.zip"
/usr/bin/curl -fL# "$ZIP_URL" -o "$ZIP_TMP"

echo "  Extracting..."
EXTRACT_TMP="/tmp/miniclaw-extract-$$"
rm -rf "$EXTRACT_TMP"
mkdir -p "$EXTRACT_TMP"
unzip -q -o "$ZIP_TMP" -d "$EXTRACT_TMP"
rm -f "$ZIP_TMP"

BUNDLED_WEB="$EXTRACT_TMP/miniclaw-installer.app/Contents/Resources/miniclaw-web"
BUNDLED_PLUGINS="$EXTRACT_TMP/miniclaw-installer.app/Contents/Resources/plugins-prebuilt"
if [[ -d "$BUNDLED_WEB" && -f "$BUNDLED_WEB/server.js" ]]; then
  rm -rf "$WEB_DIR"
  mkdir -p "$STATE_DIR"
  mv "$BUNDLED_WEB" "$WEB_DIR"
else
  echo "  ERROR: Pre-built app not in zip. Try again or use the .app installer."
  rm -rf "$EXTRACT_TMP"
  exit 1
fi

# Stage pre-built plugins for install.sh to use
PREBUILT_STAGING="$STATE_DIR/.plugins-prebuilt"
rm -rf "$PREBUILT_STAGING"
if [[ -d "$BUNDLED_PLUGINS" ]]; then
  mv "$BUNDLED_PLUGINS" "$PREBUILT_STAGING"
  echo "  ✓ Pre-built plugins staged"
fi
rm -rf "$EXTRACT_TMP"

# ── Prep state dir ───────────────────────────────────────────────────────────
mkdir -p "$STATE_DIR/USER" "$STATE_DIR/logs" "$STATE_DIR/miniclaw/USER/projects" "$STATE_DIR/.tailscale"
rm -f "$STATE_DIR/USER/setup-state.json"
ln -sfn "$STATE_DIR/miniclaw/USER/projects" "$HOME/mc-projects"

# ── Rebuild native modules for this machine's Node version ────────────────────
echo "  Preparing native modules..."
SQLITE_DIR=$(find "$WEB_DIR/.next/node_modules" -name "better-sqlite3-*" -type d 2>/dev/null | head -1)
if [[ -n "$SQLITE_DIR" && -f "$SQLITE_DIR/package.json" ]]; then
  (cd "$SQLITE_DIR" && PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH" npm install --ignore-scripts=false >>"$LOG_FILE" 2>&1) || true
fi

# ── Kill existing on port (force — stale processes hold the old code in memory) ─
launchctl unload "$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist" 2>/dev/null || true
rm -f "$STATE_DIR/.install-lock"
for pid in $(lsof -ti ":$APP_PORT" 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null
done
sleep 1

# ── Install LaunchAgent ──────────────────────────────────────────────────────
echo "  Starting service..."
PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.board-web</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$WEB_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$WEB_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/logs/miniclaw-web.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/miniclaw-web.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PORT</key>
    <string>$APP_PORT</string>
    <key>HOSTNAME</key>
    <string>0.0.0.0</string>
    <key>PATH</key>
    <string>$HOME/.local/bin:$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.bun/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
    <key>MINICLAW_OS_DIR</key>
    <string>$INSTALL_DIR</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>
PLIST

launchctl load "$PLIST" 2>/dev/null

# ── Open browser immediately — server starts in ~40ms ────────────────────────
sleep 1
echo "  ✓ Opening browser..."
open "http://myam.localhost:$APP_PORT"

# ── Clone repo and start install.sh in background ────────────────────────────
echo "  Starting install..."
INSTALL_LOG="/tmp/miniclaw-install.log"
rm -f "$INSTALL_LOG"
(
  mkdir -p "$(dirname "$INSTALL_DIR")"
  [[ -d "$INSTALL_DIR/.git" ]] || git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>>"$LOG_FILE"
  if [[ -f "$INSTALL_DIR/install.sh" ]]; then
    OPENCLAW_STATE_DIR="$STATE_DIR" MINICLAW_NONINTERACTIVE=1 bash "$INSTALL_DIR/install.sh" >"$INSTALL_LOG" 2>&1
  fi
) &

# ── Done ─────────────────────────────────────────────────────────────────────
if $IS_APP; then
  osascript -e 'display notification "MiniClaw is ready!" with title "MiniClaw" sound name "Glass"' 2>/dev/null
  sleep 1
  osascript -e '
  tell application "Terminal"
    if (count of windows) > 0 then close front window
    if (count of windows) = 0 then quit
  end tell
  ' 2>/dev/null &
else
  echo "  ✓ MiniClaw is running at http://myam.localhost:$APP_PORT"
  echo "  You can close this terminal."
  echo ""
fi

exit 0
