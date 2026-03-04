#!/usr/bin/env bash
# bootstrap.sh — miniclaw-os one-line installer
#
# Installs all system dependencies, OpenClaw (MiniClaw fork), and miniclaw plugins.
# Safe to re-run — skips anything already installed.
#
# Usage (stable release):
#   curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/v1.0.0/bootstrap.sh | bash
#
# Usage (latest main):
#   curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash

set -euo pipefail

MINICLAW_VERSION="${MINICLAW_VERSION:-v1.0.0}"
REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
PROJECTS_DIR="$OPENCLAW_DIR/projects"
MINICLAW_OS_DIR="$PROJECTS_DIR/miniclaw-os"
LOG_FILE="/tmp/miniclaw-install.log"
ARCH=$(uname -m)

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== miniclaw-os bootstrap started $(date) ===" >> "$LOG_FILE"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()      { echo -e "  ${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "  ${YELLOW}[!]${NC} $1"; }
fail()    { echo -e "  ${RED}[✗]${NC} $1"; }
info()    { echo -e "  ${BLUE}[i]${NC} $1"; }
step()    { echo -e "\n${BOLD}── $1${RESET:-}"; }
die()     { fail "$1"; exit 1; }

echo ""
echo -e "${BOLD}miniclaw-os bootstrap${NC}"
echo "  log: $LOG_FILE"
echo ""
echo "  This will install:"
echo "    • Homebrew, Node.js 22, Git, Python 3, jq, bun, QMD"
echo "    • OpenClaw (npm global)"
echo "    • miniclaw-os plugins and CLI tools"
echo ""
read -rp "  Continue? (y/N): " CONFIRM
[[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || { echo "  Aborted."; exit 0; }

# Homebrew prefix
if [[ "$ARCH" == "arm64" ]]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi

# ── Step 1: Preflight ─────────────────────────────────────────────────────────
step "Step 1: Preflight"

[[ "$(uname)" == "Darwin" ]] || die "macOS required"
ok "macOS $(sw_vers -productVersion)"

MACOS_MAJOR=$(sw_vers -productVersion | cut -d. -f1)
[[ "$MACOS_MAJOR" -ge 13 ]] || die "macOS 13+ required"

# Sudo keepalive
if ! sudo -n true 2>/dev/null; then
  info "sudo required for some installations:"
  sudo -v || die "sudo access required"
fi
( while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) &
SUDO_PID=$!
trap "kill $SUDO_PID 2>/dev/null || true" EXIT
ok "sudo confirmed"

# ── Step 2: Homebrew ──────────────────────────────────────────────────────────
step "Step 2: Homebrew"

if command -v brew &>/dev/null; then
  ok "Homebrew already installed"
  brew update --quiet 2>/dev/null && ok "Updated" || warn "brew update failed (non-fatal)"
else
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || die "Homebrew install failed"
  if [[ "$ARCH" == "arm64" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
      grep -q 'brew shellenv' "$p" 2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$p"
    done
  fi
  ok "Homebrew installed"
fi

# ── Step 3: Node.js ───────────────────────────────────────────────────────────
step "Step 3: Node.js 22 LTS"

NEED_NODE=false
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node --version | tr -d 'v' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node.js $(node --version) already installed"
  else
    warn "Node.js $(node --version) too old — upgrading to 22"
    NEED_NODE=true
  fi
else
  NEED_NODE=true
fi

if $NEED_NODE; then
  info "Installing Node.js 22 LTS..."
  brew install node@22
  brew link --overwrite node@22 2>/dev/null || true
  NODE_PATH="$BREW_PREFIX/opt/node@22/bin"
  if [[ -d "$NODE_PATH" && ":$PATH:" != *":$NODE_PATH:"* ]]; then
    export PATH="$NODE_PATH:$PATH"
    for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
      grep -q 'node@22' "$p" 2>/dev/null || echo "export PATH=\"$NODE_PATH:\$PATH\"" >> "$p"
    done
  fi
fi
command -v npm &>/dev/null || die "npm not found after Node.js install"
ok "Node.js $(node --version) / npm $(npm --version)"

# ── Step 4: Git ───────────────────────────────────────────────────────────────
step "Step 4: Git"

if command -v git &>/dev/null; then
  ok "Git $(git --version | awk '{print $3}') already installed"
else
  brew install git && ok "Git installed"
fi

# ── Step 5: Python 3 ──────────────────────────────────────────────────────────
step "Step 5: Python 3"

if command -v python3 &>/dev/null; then
  ok "Python $(python3 --version | awk '{print $2}') already installed"
else
  brew install python@3 && ok "Python 3 installed"
fi

# ── Step 6: jq ────────────────────────────────────────────────────────────────
step "Step 6: jq"

if command -v jq &>/dev/null; then
  ok "jq $(jq --version) already installed"
else
  brew install jq && ok "jq installed"
fi

# ── Step 7: age (vault encryption) ────────────────────────────────────────────
step "Step 7: age"

if command -v age &>/dev/null; then
  ok "age already installed"
else
  brew install age && ok "age installed"
fi

# ── Step 8: Bun ───────────────────────────────────────────────────────────────
step "Step 8: Bun"

if command -v bun &>/dev/null || [[ -f "$HOME/.bun/bin/bun" ]]; then
  [[ -f "$HOME/.bun/bin/bun" ]] && export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun already installed"
else
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
    grep -q '.bun/bin' "$p" 2>/dev/null || echo 'export PATH="$HOME/.bun/bin:$PATH"' >> "$p"
  done
  ok "Bun installed"
fi

# ── Step 9: QMD ───────────────────────────────────────────────────────────────
step "Step 9: QMD"

if command -v qmd &>/dev/null || [[ -f "$HOME/.bun/bin/qmd" ]]; then
  ok "QMD already installed"
else
  bun install -g qmd 2>/dev/null && ok "QMD installed" || warn "QMD install failed — run: bun install -g qmd"
fi

# ── Step 10: OpenClaw (from MiniClaw fork) ────────────────────────────────────
step "Step 10: OpenClaw"

OPENCLAW_FORK="github:augmentedmike/openclaw"

if command -v openclaw &>/dev/null; then
  ok "OpenClaw $(openclaw --version 2>/dev/null | head -1) already installed"
else
  info "Installing OpenClaw from MiniClaw fork..."
  npm install -g "$OPENCLAW_FORK" || die "OpenClaw install failed"
  command -v openclaw &>/dev/null && ok "OpenClaw $(openclaw --version 2>/dev/null | head -1) installed" || die "openclaw not found in PATH after install"
fi

# Initialise ~/.openclaw if it doesn't exist yet
mkdir -p "$OPENCLAW_DIR"
if [[ ! -f "$OPENCLAW_DIR/openclaw.json" ]]; then
  info "Creating minimal openclaw.json..."
  python3 - "$OPENCLAW_DIR/openclaw.json" <<'PYEOF'
import json, sys
cfg = {
  "meta": {},
  "agents": {
    "defaults": {
      "model": { "primary": "claude-sonnet-4-6" },
      "compaction": { "mode": "safeguard" }
    }
  },
  "plugins": {}
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PYEOF
  ok "openclaw.json created"
fi

# ── Step 11: PATH check ───────────────────────────────────────────────────────
step "Step 11: PATH"

LOCAL_BIN="$HOME/.local/bin"
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
    grep -q '.local/bin' "$p" 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$p"
  done
  export PATH="$LOCAL_BIN:$PATH"
  warn "Added ~/.local/bin to PATH (restart your shell or run: source ~/.zshrc)"
else
  ok "~/.local/bin in PATH"
fi

# ── Step 12: Clone or update miniclaw-os ─────────────────────────────────────
step "Step 12: miniclaw-os"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$PROJECTS_DIR"

if [[ "$SCRIPT_DIR" == "$MINICLAW_OS_DIR" ]]; then
  # Already running from inside the repo
  ok "miniclaw-os ready (running in-place)"
elif [[ -d "$MINICLAW_OS_DIR/.git" ]]; then
  git -C "$MINICLAW_OS_DIR" fetch --tags --quiet
  git -C "$MINICLAW_OS_DIR" checkout "$MINICLAW_VERSION" --quiet 2>/dev/null || git -C "$MINICLAW_OS_DIR" pull --ff-only
  ok "miniclaw-os @ $MINICLAW_VERSION"
else
  git clone --branch "$MINICLAW_VERSION" --depth 1 "$REPO_URL" "$MINICLAW_OS_DIR"
  ok "miniclaw-os $MINICLAW_VERSION → $MINICLAW_OS_DIR"
fi

# ── Step 13: Run miniclaw installer ──────────────────────────────────────────
step "Step 13: miniclaw plugins + vault"

exec bash "$MINICLAW_OS_DIR/install.sh"
