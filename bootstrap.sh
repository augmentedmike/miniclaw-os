#!/usr/bin/env bash
# bootstrap.sh — miniclaw-os one-click installer
#
# This script is downloaded as "Install MiniClaw.command" and double-clicked
# by the user from Finder. It uses osascript for the password dialog so there
# is no terminal interaction. The Terminal window hides itself and closes
# when done.
#
# Usage: double-click "Install MiniClaw.command" from Finder

set -euo pipefail

REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
INSTALL_DIR="${HOME}/.openclaw/projects/miniclaw-os"
STATE_DIR="${HOME}/.openclaw"
APP_PORT=4220
LOG_FILE="/tmp/miniclaw-bootstrap.log"

# ── Hide the Terminal window immediately ─────────────────────────────────────
osascript -e 'tell application "Terminal" to set visible of front window to false' 2>/dev/null &

# ── Show a friendly notification ─────────────────────────────────────────────
osascript -e 'display notification "Setting up — this will be quick..." with title "MiniClaw"' 2>/dev/null &
echo ""
echo "  🦀 MiniClaw"
echo "  Setting up..."
echo ""

# ── macOS check ──────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || exit 1

# ── Get sudo via native macOS dialog ─────────────────────────────────────────
get_sudo() {
  # Try cached sudo first
  if sudo -n true 2>/dev/null; then
    return 0
  fi

  # Retry up to 3 times
  for attempt in 1 2 3; do
    local PW
    PW=$(osascript <<'APPLESCRIPT'
tell current application
  activate
end tell
display dialog "MiniClaw needs your Mac password to finish setting up." & return & return & "Your password is only used locally and is never stored." default answer "" with hidden answer with title "MiniClaw Setup" with icon caution buttons {"Cancel", "OK"} default button "OK"
text returned of result
APPLESCRIPT
    ) || exit 0  # User clicked Cancel

    if [[ -z "$PW" ]]; then
      osascript -e 'display dialog "Password cannot be empty." with title "MiniClaw Setup" buttons {"OK"} default button "OK" with icon stop'
      continue
    fi

    if echo "$PW" | sudo -S true 2>/dev/null; then
      # Keep sudo alive in background
      ( while true; do sudo -n true 2>/dev/null; sleep 50; kill -0 $$ 2>/dev/null || exit; done ) &
      return 0
    else
      osascript -e 'display dialog "Incorrect password. Please try again." with title "MiniClaw Setup" buttons {"OK"} default button "OK" with icon stop'
    fi
  done

  osascript -e 'display dialog "Could not verify your password after 3 attempts." with title "MiniClaw Setup" buttons {"OK"} default button "OK" with icon stop'
  exit 1
}

get_sudo

# ── Xcode CLT (provides git) ────────────────────────────────────────────────
if ! xcode-select -p &>/dev/null; then
  osascript -e 'display notification "Installing developer tools..." with title "MiniClaw"' 2>/dev/null
  xcode-select --install 2>/dev/null || true
  until xcode-select -p &>/dev/null; do sleep 5; done
fi

# ── Homebrew ─────────────────────────────────────────────────────────────────
BREW_PREFIX=$([[ "$(uname -m)" == "arm64" ]] && echo "/opt/homebrew" || echo "/usr/local")

if ! command -v brew &>/dev/null && [[ ! -x "$BREW_PREFIX/bin/brew" ]]; then
  osascript -e 'display notification "Installing Homebrew..." with title "MiniClaw"' 2>/dev/null
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" >>"$LOG_FILE" 2>&1
fi
[[ -x "$BREW_PREFIX/bin/brew" ]] && eval "$($BREW_PREFIX/bin/brew shellenv)"

# ── Node.js ──────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  osascript -e 'display notification "Installing Node.js..." with title "MiniClaw"' 2>/dev/null
  brew install node@22 >>"$LOG_FILE" 2>&1
  export PATH="$BREW_PREFIX/opt/node@22/bin:$PATH"
fi

NODE_BIN=$(which node 2>/dev/null || echo "$BREW_PREFIX/opt/node@22/bin/node")
export PATH="$(dirname "$NODE_BIN"):$BREW_PREFIX/bin:$PATH"

# ── Evacuate any existing install ────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  EVAC_DIR="${INSTALL_DIR}.previous-$(date +%Y%m%d-%H%M%S)"
  mv "$INSTALL_DIR" "$EVAC_DIR"
  export OPENCLAW_EVAC_DIR="$EVAC_DIR"
fi

# ── Download pre-built web app ────────────────────────────────────────────────
WEB_DIR="$STATE_DIR/web"
ZIP_URL="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/dist/MiniClaw-Installer-v0.1.5.zip"
ZIP_TMP="/tmp/miniclaw-installer-$$.zip"

osascript -e 'display notification "Downloading MiniClaw..." with title "MiniClaw"' 2>/dev/null
echo "  Downloading..."
/usr/bin/curl -fsSL "$ZIP_URL" -o "$ZIP_TMP" 2>>"$LOG_FILE"

# Extract the pre-built web app from the .app bundle inside the zip
EXTRACT_TMP="/tmp/miniclaw-extract-$$"
mkdir -p "$EXTRACT_TMP"
unzip -q -o "$ZIP_TMP" -d "$EXTRACT_TMP"
rm -f "$ZIP_TMP"

# Deploy the pre-built web app
rm -rf "$WEB_DIR"
if [[ -d "$EXTRACT_TMP/Install MiniClaw.app/Contents/Resources/miniclaw-web" ]]; then
  mv "$EXTRACT_TMP/Install MiniClaw.app/Contents/Resources/miniclaw-web" "$WEB_DIR"
else
  # Fallback: clone and build if zip doesn't have pre-built app
  echo "  Pre-built app not found in zip — building from source..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>>"$LOG_FILE"
  APP_DIR="$INSTALL_DIR/plugins/mc-board/web"
  (cd "$APP_DIR" && npm install --silent >>"$LOG_FILE" 2>&1)
  (cd "$APP_DIR" && npx next build >>"$LOG_FILE" 2>&1) || true
  # Use standalone output
  cp -a "$APP_DIR/.next/standalone/." "$WEB_DIR/" 2>/dev/null || true
  cp -r "$APP_DIR/.next/static" "$WEB_DIR/.next/static" 2>/dev/null || true
  cp -r "$APP_DIR/public" "$WEB_DIR/public" 2>/dev/null || true
fi
rm -rf "$EXTRACT_TMP"
echo "  ✓ App ready"

# ── Clone the repo in the background (for install.sh later) ──────────────────
(
  mkdir -p "$(dirname "$INSTALL_DIR")"
  [[ -d "$INSTALL_DIR/.git" ]] || git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>>"$LOG_FILE"
) &

# ── Reset setup state ────────────────────────────────────────────────────────
mkdir -p "$STATE_DIR/USER" "$STATE_DIR/logs"
rm -f "$STATE_DIR/USER/setup-state.json"

# .localhost TLD always resolves to 127.0.0.1 — no /etc/hosts needed

# ── Install board-web LaunchAgent ────────────────────────────────────────────
PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"
mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$PLIST" 2>/dev/null || true

# Kill anything on the port
PORT_PID=$(lsof -ti ":$APP_PORT" 2>/dev/null | head -1 || true)
[[ -n "$PORT_PID" ]] && kill "$PORT_PID" 2>/dev/null && sleep 1

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
  <string>$STATE_DIR/logs/miniclaw-board-web.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/miniclaw-board-web.log</string>
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

# ── Wait for the app ─────────────────────────────────────────────────────────
for i in $(seq 1 30); do
  curl -sf "http://localhost:$APP_PORT/api/health" &>/dev/null && break
  sleep 1
done

# ── Open browser ─────────────────────────────────────────────────────────────
open "http://myam.localhost:4220"
osascript -e 'display notification "Look for your browser window — MiniClaw is ready!" with title "MiniClaw" sound name "Glass"' 2>/dev/null

# ── Close the Terminal window ────────────────────────────────────────────────
sleep 1
osascript -e '
tell application "Terminal"
  if (count of windows) > 0 then
    close front window
  end if
  if (count of windows) = 0 then
    quit
  end if
end tell
' 2>/dev/null &

exit 0
