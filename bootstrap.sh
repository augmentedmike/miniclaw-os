#!/usr/bin/env bash
# bootstrap.sh — miniclaw-os one-line installer
#
# Downloads miniclaw-os and runs the full installer.
# Safe to re-run — pulls latest if already installed.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash

set -euo pipefail

REPO_URL="https://github.com/augmentedmike/miniclaw-os.git"
LOG_FILE="/tmp/miniclaw-install.log"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== miniclaw-os bootstrap started $(date) ===" >> "$LOG_FILE"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
PROJECTS_DIR="$OPENCLAW_DIR/projects"
MINICLAW_OS_DIR="$PROJECTS_DIR/miniclaw-os"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET}  $1"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $1"; }
fail() { echo -e "${RED}  ✗${RESET}  $1"; }
step() { echo -e "\n${BOLD}── $1${RESET}"; }

echo -e "\n${BOLD}miniclaw-os bootstrap${RESET}"
echo "  log: $LOG_FILE"

# ── Check OpenClaw ─────────────────────────────────────────────────────────────
step "Checking OpenClaw"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  fail "OpenClaw not found at $OPENCLAW_DIR"
  echo ""
  echo "  OpenClaw must be installed and launched at least once before running this."
  echo "  Download it at: https://openclaw.ai"
  echo ""
  exit 1
fi
ok "OpenClaw found"

if ! command -v openclaw &>/dev/null; then
  fail "'openclaw' command not found on PATH"
  echo "  Make sure OpenClaw is installed: https://openclaw.ai"
  exit 1
fi
ok "openclaw on PATH"

if [[ ! -f "$OPENCLAW_DIR/openclaw.json" ]]; then
  fail "openclaw.json not found — launch OpenClaw once to initialise it, then re-run."
  exit 1
fi
ok "openclaw.json found"

# ── Check git ─────────────────────────────────────────────────────────────────
step "Checking git"

if ! command -v git &>/dev/null; then
  fail "'git' not found"
  echo "  Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi
ok "git found"

# ── Clone or update miniclaw-os ───────────────────────────────────────────────
step "Fetching miniclaw-os"

mkdir -p "$PROJECTS_DIR"

if [[ -d "$MINICLAW_OS_DIR/.git" ]]; then
  git -C "$MINICLAW_OS_DIR" pull --ff-only
  ok "Updated miniclaw-os → $MINICLAW_OS_DIR"
else
  git clone "$REPO_URL" "$MINICLAW_OS_DIR"
  ok "Cloned miniclaw-os → $MINICLAW_OS_DIR"
fi

# ── Run installer ─────────────────────────────────────────────────────────────
echo ""
exec bash "$MINICLAW_OS_DIR/install.sh"
