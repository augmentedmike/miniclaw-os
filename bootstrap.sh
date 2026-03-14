#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
INSTALL_DIR="${HOME}/.openclaw/projects/miniclaw-os"
STATE_DIR="${HOME}/.openclaw"
WEB_DIR="$STATE_DIR/web"
APP_PORT=4220
LOG_FILE="/tmp/miniclaw-bootstrap.log"
ZIP_URL="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/dist/MiniClaw-Installer-v0.1.5.zip"

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
echo "  Downloading..."
ZIP_TMP="/tmp/miniclaw-installer-$$.zip"
/usr/bin/curl -fsSL "$ZIP_URL" -o "$ZIP_TMP" 2>>"$LOG_FILE"

EXTRACT_TMP="/tmp/miniclaw-extract-$$"
rm -rf "$EXTRACT_TMP"
mkdir -p "$EXTRACT_TMP"
unzip -q -o "$ZIP_TMP" -d "$EXTRACT_TMP"
rm -f "$ZIP_TMP"

# Find the miniclaw-web dir (handle spaces in path)
BUNDLED_WEB="$EXTRACT_TMP/Install MiniClaw.app/Contents/Resources/miniclaw-web"
if [[ -d "$BUNDLED_WEB" && -f "$BUNDLED_WEB/server.js" ]]; then
  echo "  Installing app..."
  rm -rf "$WEB_DIR"
  mkdir -p "$STATE_DIR"
  mv "$BUNDLED_WEB" "$WEB_DIR"
  echo "  ✓ App installed"
else
  echo "  Pre-built app not found — building from source..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>>"$LOG_FILE"
  APP_SRC="$INSTALL_DIR/plugins/mc-board/web"
  (cd "$APP_SRC" && npm install --silent >>"$LOG_FILE" 2>&1)
  (cd "$APP_SRC" && npx next build >>"$LOG_FILE" 2>&1) || true
  rm -rf "$WEB_DIR"
  mkdir -p "$WEB_DIR"
  cp -a "$APP_SRC/.next/standalone/." "$WEB_DIR/"
  cp -r "$APP_SRC/.next/static" "$WEB_DIR/.next/static"
  cp -r "$APP_SRC/public" "$WEB_DIR/public"
  echo "  ✓ App built"
fi
rm -rf "$EXTRACT_TMP"

# Clone repo in background (for install.sh later)
(
  mkdir -p "$(dirname "$INSTALL_DIR")"
  [[ -d "$INSTALL_DIR/.git" ]] || git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>>"$LOG_FILE"
) &

# ── Setup state ──────────────────────────────────────────────────────────────
mkdir -p "$STATE_DIR/USER" "$STATE_DIR/logs"
rm -f "$STATE_DIR/USER/setup-state.json"

# ── Kill existing on port ────────────────────────────────────────────────────
launchctl unload "$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist" 2>/dev/null || true
PORT_PID=$(lsof -ti ":$APP_PORT" 2>/dev/null | head -1 || true)
[[ -n "$PORT_PID" ]] && kill "$PORT_PID" 2>/dev/null && sleep 1

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
    <string>$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
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

# ── Wait for app ─────────────────────────────────────────────────────────────
echo "  Waiting for app to start..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:$APP_PORT/api/health" &>/dev/null; then
    echo "  ✓ Ready"
    break
  fi
  sleep 1
done

# ── Open browser ─────────────────────────────────────────────────────────────
echo ""
echo "  Opening http://myam.localhost:$APP_PORT"
echo ""
open "http://myam.localhost:$APP_PORT"

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
