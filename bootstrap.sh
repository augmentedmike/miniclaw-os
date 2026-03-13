#!/usr/bin/env bash
# bootstrap.sh — miniclaw-os one-click installer
#
# Downloads the repo and launches the setup web app — everything
# happens in the browser from there. No terminal knowledge needed.
#
# Usage:
#   curl -fsSL https://miniclaw.bot/install | bash
#   curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash

set -euo pipefail

REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
MINICLAW_VERSION="${MINICLAW_VERSION:-main}"
INSTALL_DIR="${HOME}/.openclaw/projects/miniclaw-os"
SETUP_PORT=4210
LOG_FILE="/tmp/miniclaw-bootstrap.log"

echo ""
echo "  🦀 MiniClaw"
echo "  Starting setup..."
echo ""

# ── macOS check ──────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || { echo "  Error: macOS required."; exit 1; }

# ── Xcode CLT (provides git) ────────────────────────────────────────────────
if ! xcode-select -p &>/dev/null; then
  echo "  Installing developer tools (this may take a minute)..."
  xcode-select --install 2>/dev/null || true
  # Wait for the install to finish
  until xcode-select -p &>/dev/null; do sleep 5; done
fi

# ── Node.js (for the setup web app) ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  Installing Node.js..."
  # Use Homebrew if available, otherwise fetch from nodejs.org
  if command -v brew &>/dev/null; then
    brew install node@22 >>"$LOG_FILE" 2>&1
    BREW_PREFIX=$([[ "$(uname -m)" == "arm64" ]] && echo "/opt/homebrew" || echo "/usr/local")
    export PATH="$BREW_PREFIX/opt/node@22/bin:$PATH"
  else
    # Install Homebrew first (needed for other deps later anyway)
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null >>"$LOG_FILE" 2>&1
    BREW_PREFIX=$([[ "$(uname -m)" == "arm64" ]] && echo "/opt/homebrew" || echo "/usr/local")
    eval "$($BREW_PREFIX/bin/brew shellenv)"
    brew install node@22 >>"$LOG_FILE" 2>&1
    export PATH="$BREW_PREFIX/opt/node@22/bin:$PATH"
  fi
fi

# ── Evacuate any existing install ────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  EVAC_DIR="${INSTALL_DIR}.previous-$(date +%Y%m%d-%H%M%S)"
  echo "  Backing up previous install → $(basename "$EVAC_DIR")"
  mv "$INSTALL_DIR" "$EVAC_DIR"
  export OPENCLAW_EVAC_DIR="$EVAC_DIR"
fi

# ── Fresh clone ─────────────────────────────────────────────────────────────
echo "  Downloading MiniClaw..."
mkdir -p "$(dirname "$INSTALL_DIR")"
git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR"

# ── Install setup app deps and build ────────────────────────────────────────
SETUP_DIR="$INSTALL_DIR/apps/am-setup"
echo "  Preparing setup app..."
(cd "$SETUP_DIR" && npm install --silent >>"$LOG_FILE" 2>&1)
(cd "$SETUP_DIR" && npx next build >>"$LOG_FILE" 2>&1) || true

# ── Kill anything on the setup port ─────────────────────────────────────────
PORT_PID=$(lsof -ti ":$SETUP_PORT" 2>/dev/null | head -1 || true)
if [[ -n "$PORT_PID" ]]; then
  kill "$PORT_PID" 2>/dev/null || true
  sleep 1
fi

# ── Start the setup web app ─────────────────────────────────────────────────
echo "  Starting setup at http://localhost:$SETUP_PORT"
echo ""

# Set env vars the app needs
export OPENCLAW_STATE_DIR="${HOME}/.openclaw"
export MINICLAW_OS_DIR="$INSTALL_DIR"
export NODE_ENV=production

# Start in background, open browser
cd "$SETUP_DIR"
npx next start -p "$SETUP_PORT" >>"$LOG_FILE" 2>&1 &
SETUP_PID=$!

# Wait for the server to be ready
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$SETUP_PORT/api/health" &>/dev/null; then
    break
  fi
  sleep 1
done

# Open browser
if command -v open &>/dev/null; then
  open "http://localhost:$SETUP_PORT"
fi

echo "  ✓ Setup is running in your browser."
echo ""
echo "  If the browser didn't open, go to:"
echo "  http://localhost:$SETUP_PORT"
echo ""
echo "  Close this terminal window when you're done."
echo ""

# Keep running until the setup app exits
wait $SETUP_PID 2>/dev/null || true
