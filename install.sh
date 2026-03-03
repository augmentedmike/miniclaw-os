#!/usr/bin/env bash
# install.sh — miniclaw-os full installer
#
# Installs all miniclaw plugins and CLI tools into an existing OpenClaw installation.
# OpenClaw must already be installed at ~/.openclaw.
#
# Usage:
#   ./install.sh          Full install (idempotent — safe to re-run)
#   ./install.sh --check  Verify only, make no changes
#
# On re-install: plugins are rsynced (updated), existing openclaw.json plugin
# config is preserved (never overwritten), CLI tools are overwritten with latest.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
MINICLAW_DIR="$OPENCLAW_DIR/miniclaw"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

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

# ── Verify OpenClaw ───────────────────────────────────────────────────────────
step "Verifying OpenClaw"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  fail "OpenClaw not found at $OPENCLAW_DIR"
  echo "  Install OpenClaw first: https://openclaw.ai"
  exit 1
fi
ok "OpenClaw directory: $OPENCLAW_DIR"

if ! command -v openclaw &>/dev/null; then
  fail "'openclaw' not on PATH"
  echo "  Make sure openclaw is installed and on your PATH."
  exit 1
fi
OPENCLAW_VERSION=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
ok "openclaw binary ($OPENCLAW_VERSION)"

if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  fail "openclaw.json not found at $OPENCLAW_CONFIG"
  exit 1
fi
ok "openclaw.json found"

[[ "$CHECK_ONLY" == true ]] && { echo -e "\n${GREEN}Check passed.${RESET}\n"; exit 0; }

# ── Install plugins ───────────────────────────────────────────────────────────
step "Installing plugins → $MINICLAW_DIR/plugins"

mkdir -p "$MINICLAW_DIR/plugins"

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

# Default configs per plugin.
# Only written if the entry doesn't already exist — preserves user config.
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
        continue  # skip plugins not present in this install

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

# ── PATH check ────────────────────────────────────────────────────────────────
step "Checking PATH"

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  warn "$LOCAL_BIN is not in your PATH"
  echo "    Add to your shell profile (~/.zshrc or ~/.bashrc):"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  ok "$LOCAL_BIN is in PATH"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${RESET}"
echo ""
echo "  Restart OpenClaw to load the plugins:"
echo "    openclaw gateway restart"
echo ""
echo "  Verify:"
echo "    mc-smoke"
echo ""
