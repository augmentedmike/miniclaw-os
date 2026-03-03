#!/usr/bin/env bash
# install.sh — miniclaw-os full installer
#
# Installs all miniclaw plugins and CLI tools into an existing OpenClaw installation.
# OpenClaw must already be installed and have run at least once (openclaw.json must exist).
#
# Usage:
#   ./install.sh          Full install (idempotent — safe to re-run)
#   ./install.sh --check  Verify only, make no changes

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
MINICLAW_DIR="$OPENCLAW_DIR/miniclaw"
PROJECTS_DIR="$OPENCLAW_DIR/projects"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
LOG_FILE="/tmp/miniclaw-install.log"

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

# Tee all output to log file so it can be tailed remotely
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== miniclaw-os install started $(date) ===" >> "$LOG_FILE"

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

echo -e "\n${BOLD}miniclaw-os installer${RESET}"
echo "  source : $REPO_DIR"
echo "  install: $MINICLAW_DIR"
echo "  log    : $LOG_FILE"

# ── Verify prerequisites ───────────────────────────────────────────────────────
step "Verifying prerequisites"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  fail "OpenClaw directory not found at $OPENCLAW_DIR"
  echo "  Launch OpenClaw once to initialise it, then re-run this installer."
  exit 1
fi
ok "OpenClaw directory: $OPENCLAW_DIR"

if ! command -v openclaw &>/dev/null; then
  fail "'openclaw' not on PATH"
  echo "  Install OpenClaw first: https://openclaw.ai"
  exit 1
fi
OPENCLAW_VERSION=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
ok "openclaw ($OPENCLAW_VERSION)"

if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  fail "openclaw.json not found at $OPENCLAW_CONFIG"
  echo "  Launch OpenClaw once to generate it, then re-run."
  exit 1
fi
ok "openclaw.json found"

if ! command -v age &>/dev/null; then
  warn "'age' not found — vault features will be unavailable"
  warn "Install with: brew install age"
  AGE_AVAILABLE=false
else
  ok "age encryption"
  AGE_AVAILABLE=true
fi

[[ "$CHECK_ONLY" == true ]] && { echo -e "\n${GREEN}Check passed.${RESET}\n"; exit 0; }

# ── Create directories ────────────────────────────────────────────────────────
step "Directories"

mkdir -p "$MINICLAW_DIR/plugins"
mkdir -p "$PROJECTS_DIR"
ok "~/.openclaw/projects/"
ok "~/.openclaw/miniclaw/plugins/"

# ── Install plugins ───────────────────────────────────────────────────────────
step "Installing plugins"

for plugin_src in "$REPO_DIR/plugins"/*/; do
  plugin_name="$(basename "$plugin_src")"
  plugin_dest="$MINICLAW_DIR/plugins/$plugin_name"
  already_exists=false
  [[ -d "$plugin_dest" ]] && already_exists=true

  rsync -a --exclude='node_modules' --exclude='.git' "$plugin_src" "$plugin_dest/"

  if $already_exists; then
    ok "Updated:   $plugin_name"
  else
    ok "Installed: $plugin_name"
  fi
done

# ── Patch openclaw.json ───────────────────────────────────────────────────────
step "Patching openclaw.json"

python3 - "$OPENCLAW_CONFIG" "$MINICLAW_DIR" <<'PYEOF'
import json, sys, os

config_path = sys.argv[1]
mcl_dir = sys.argv[2]
plugins_dir = os.path.join(mcl_dir, "plugins")

with open(config_path) as f:
    cfg = json.load(f)

p = cfg.setdefault("plugins", {})
p.setdefault("enabled", True)
p.setdefault("allow", [])
p.setdefault("load", {}).setdefault("paths", [])
p.setdefault("entries", {})

plugin_defaults = {
    "mc-board": {
        "enabled": True,
        "config": {
            "cardsDir": "~/.openclaw/user/brain/cards",
            "qmdBin": "~/.bun/bin/qmd",
            "qmdCollection": "mc-board",
            "webPort": 4220,
        },
    },
    "mc-designer": {
        "enabled": True,
        "config": {
            "apiKey": "",
            "model": "gemini-2.0-flash-exp",
            "mediaDir": "~/.openclaw/media/designer",
            "defaultWidth": 1024,
            "defaultHeight": 1024,
        },
    },
    "mc-trust": {
        "enabled": True,
        "config": {
            "agentId": "am",
            "trustDir": "~/.openclaw/trust",
            "vaultBin": "~/.openclaw/miniclaw/system/bin/mc-vault",
            "sessionTtlMs": 3600000,
        },
    },
    "mc-context": {
        "enabled": True,
        "config": {
            "windowMinutes": 60,
            "windowMinMessages": 10,
            "maxImagesInHistory": 2,
            "applyToChannels": True,
            "applyToDMs": True,
            "replaceMessages": True,
        },
    },
}

registered = []
for name, defaults in plugin_defaults.items():
    plugin_path = os.path.join(plugins_dir, name)
    if not os.path.isdir(plugin_path):
        continue

    if name not in p["allow"]:
        p["allow"].append(name)
    if plugin_path not in p["load"]["paths"]:
        p["load"]["paths"].append(plugin_path)
    if name not in p["entries"]:
        p["entries"][name] = defaults

    registered.append(name)

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

print(f"  registered: {', '.join(registered)}")
PYEOF

ok "openclaw.json updated"

# ── Install CLI tools ─────────────────────────────────────────────────────────
step "Installing CLI tools → $LOCAL_BIN"

mkdir -p "$LOCAL_BIN"

for bin_src in "$REPO_DIR/system/bin"/*; do
  [[ -f "$bin_src" ]] || continue
  bin_name="$(basename "$bin_src")"
  cp "$bin_src" "$LOCAL_BIN/$bin_name"
  chmod +x "$LOCAL_BIN/$bin_name"
  ok "Installed: $bin_name"
done

# ── Vault setup ───────────────────────────────────────────────────────────────
step "Vault"

MC_VAULT="$LOCAL_BIN/mc-vault"

if [[ "$AGE_AVAILABLE" == false ]]; then
  warn "Skipping vault setup — age not installed"
else
  VAULT_ROOT="$MINICLAW_DIR/system/vault"

  if [[ -f "$VAULT_ROOT/key.txt" ]]; then
    ok "Vault already initialised"
  else
    # Init vault using the just-installed mc-vault binary
    OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" init
    ok "Vault initialised"
  fi

  echo ""
  echo "  Enter secrets for the vault."
  echo "  Leave blank to skip any entry."
  echo ""

  # Known secrets — add/remove as needed
  VAULT_SECRETS=(
    "gh-am-mini:GitHub personal access token (classic, repo+read:org)"
    "gmail-app-password:Gmail app password for sending email"
  )

  for entry in "${VAULT_SECRETS[@]}"; do
    key="${entry%%:*}"
    desc="${entry#*:}"
    printf "  %s\n  (%s)\n  > " "$key" "$desc"
    read -r -s value
    echo ""
    if [[ -n "$value" ]]; then
      echo -n "$value" | OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" set "$key" -
      ok "Stored: $key"
    else
      warn "Skipped: $key"
    fi
  done
fi

# ── PATH check ────────────────────────────────────────────────────────────────
step "Checking PATH"

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  warn "$LOCAL_BIN is not in your PATH"
  echo "    Add to ~/.zshrc or ~/.bashrc:"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  ok "$LOCAL_BIN is in PATH"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${RESET}"
echo ""
echo "  Restart OpenClaw to load the plugins, then verify:"
echo "    mc-smoke"
echo ""
