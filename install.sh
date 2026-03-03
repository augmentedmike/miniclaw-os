#!/usr/bin/env bash
# install.sh — miniclaw-os full installer
#
# Installs all miniclaw plugins and CLI tools into an existing OpenClaw installation.
#
# Usage:
#   ./install.sh                         Full install (idempotent — safe to re-run)
#   ./install.sh --check                 Verify only, make no changes
#   ./install.sh --from-backup <path>    Migrate from a backup openclaw dir
#
# --from-backup <path>
#   Copies openclaw.json settings (bot token, auth, etc.) from the backup.
#   Also copies vault secrets and dumps them to ~/Desktop/vault.PLAINTEXT.txt
#   if the age private key is present in the backup vault.
#   Example: ./install.sh --from-backup ~/.openclaw_original
#
# On re-install: plugins are rsynced (updated), existing openclaw.json plugin
# config is preserved (never overwritten), CLI tools are overwritten with latest.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
MINICLAW_DIR="$OPENCLAW_DIR/miniclaw"
PROJECTS_DIR="$OPENCLAW_DIR/projects"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
VAULT_ROOT="$MINICLAW_DIR/system/vault"

CHECK_ONLY=false
BACKUP_DIR=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --from-backup)
      BACKUP_DIR="${2:?--from-backup requires a path argument}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--check] [--from-backup <path>]" >&2
      exit 1
      ;;
  esac
done

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
[[ -n "$BACKUP_DIR" ]] && echo "  backup : $BACKUP_DIR"

# ── Verify prerequisites ───────────────────────────────────────────────────────
step "Verifying prerequisites"

if ! command -v openclaw &>/dev/null; then
  fail "'openclaw' not on PATH"
  echo "  Install OpenClaw first: https://openclaw.ai"
  exit 1
fi
OPENCLAW_VERSION=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
ok "openclaw binary ($OPENCLAW_VERSION)"

if ! command -v age &>/dev/null; then
  warn "'age' not found — vault features will be unavailable"
  warn "Install with: brew install age"
else
  ok "age encryption binary"
fi

if ! command -v python3 &>/dev/null; then
  fail "'python3' not on PATH (required for config patching)"
  exit 1
fi
ok "python3"

# ── Verify or create OpenClaw dir ─────────────────────────────────────────────
step "OpenClaw directory"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  if [[ "$CHECK_ONLY" == true ]]; then
    fail "OpenClaw directory not found at $OPENCLAW_DIR"
    echo "  Run OpenClaw once to initialise it, then re-run this installer."
    exit 1
  fi
  mkdir -p "$OPENCLAW_DIR"
  ok "Created $OPENCLAW_DIR"
else
  ok "Found $OPENCLAW_DIR"
fi

# ── Validate or create openclaw.json ──────────────────────────────────────────
step "openclaw.json"

if [[ -n "$BACKUP_DIR" && ! -f "$OPENCLAW_CONFIG" ]]; then
  BACKUP_CONFIG="$BACKUP_DIR/openclaw.json"
  if [[ -f "$BACKUP_CONFIG" ]]; then
    cp "$BACKUP_CONFIG" "$OPENCLAW_CONFIG"
    ok "Copied openclaw.json from backup"
  fi
fi

if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  if [[ "$CHECK_ONLY" == true ]]; then
    fail "openclaw.json not found at $OPENCLAW_CONFIG"
    exit 1
  fi
  # Create a minimal openclaw.json so OpenClaw can boot
  python3 - "$OPENCLAW_CONFIG" <<'PYEOF'
import json, sys
cfg = {
  "meta": {},
  "agents": {
    "defaults": {
      "model": { "primary": "claude-sonnet-4-5" },
      "compaction": { "mode": "safeguard" }
    }
  },
  "plugins": {}
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print(f"  Created minimal config at {sys.argv[1]}")
PYEOF
  warn "Created minimal openclaw.json — configure your bot token and API key via the OpenClaw app"
else
  ok "openclaw.json found"
fi

[[ "$CHECK_ONLY" == true ]] && { echo -e "\n${GREEN}Check passed.${RESET}\n"; exit 0; }

# ── Create project directories ────────────────────────────────────────────────
step "Project directories"

mkdir -p "$PROJECTS_DIR"
ok "~/.openclaw/projects/"

mkdir -p "$MINICLAW_DIR"
ok "~/.openclaw/miniclaw/"

# ── Vault migration ────────────────────────────────────────────────────────────
step "Vault"

BACKUP_VAULT=""
BACKUP_KEY=""
if [[ -n "$BACKUP_DIR" ]]; then
  BACKUP_VAULT="$BACKUP_DIR/miniclaw/system/vault"
  BACKUP_KEY="$BACKUP_VAULT/key.txt"
fi

mkdir -p "$VAULT_ROOT/secrets" "$VAULT_ROOT/notes" "$VAULT_ROOT/memos"
chmod 700 "$VAULT_ROOT"

if [[ -n "$BACKUP_KEY" && -f "$BACKUP_KEY" ]]; then
  # Dump all secrets to plaintext before migration
  DUMP_FILE="$HOME/Desktop/vault.PLAINTEXT.txt"
  echo "# miniclaw vault dump — $(date)" > "$DUMP_FILE"
  echo "# Generated during install migration from $BACKUP_DIR" >> "$DUMP_FILE"
  echo "# DELETE THIS FILE after storing secrets safely." >> "$DUMP_FILE"
  echo "" >> "$DUMP_FILE"

  AGE_BIN="$(command -v age || echo /opt/homebrew/bin/age)"
  dump_count=0

  for f in "$BACKUP_VAULT/secrets/"*.age; do
    [[ -f "$f" ]] || continue
    key_name="$(basename "$f" .age)"
    note_file="$BACKUP_VAULT/notes/${key_name}.txt"
    note=""
    [[ -f "$note_file" ]] && note=" ($(cat "$note_file"))"
    {
      echo "## $key_name${note}"
      "$AGE_BIN" -d -i "$BACKUP_KEY" "$f" 2>/dev/null && echo ""
    } >> "$DUMP_FILE" 2>/dev/null && ((dump_count++)) || {
      echo "ERROR: failed to decrypt $key_name" >> "$DUMP_FILE"
      echo "" >> "$DUMP_FILE"
    }
  done

  chmod 600 "$DUMP_FILE"
  ok "Dumped $dump_count secret(s) → ~/Desktop/vault.PLAINTEXT.txt"
  warn "DELETE ~/Desktop/vault.PLAINTEXT.txt after securing its contents"

  # Copy vault files into new location
  cp "$BACKUP_KEY" "$VAULT_ROOT/key.txt"
  chmod 600 "$VAULT_ROOT/key.txt"
  ok "Vault key migrated"

  rsync -a "$BACKUP_VAULT/secrets/" "$VAULT_ROOT/secrets/"
  rsync -a "$BACKUP_VAULT/notes/"   "$VAULT_ROOT/notes/"
  rsync -a "$BACKUP_VAULT/memos/"   "$VAULT_ROOT/memos/"
  ok "Vault secrets migrated"

elif [[ -n "$BACKUP_DIR" ]]; then
  warn "No vault key found in backup — vault secrets are unreadable"
  warn "Expected: $BACKUP_KEY"
  warn "Run 'mc-vault init' to start a fresh vault after install"

  # Still copy any .age files — they'll be inaccessible until key is restored
  if [[ -d "$BACKUP_VAULT/secrets" ]]; then
    rsync -a "$BACKUP_VAULT/secrets/" "$VAULT_ROOT/secrets/" 2>/dev/null || true
    warn "Copied encrypted vault files (inaccessible until key is restored)"
  fi

else
  # No backup — check if vault already has a key
  if [[ ! -f "$VAULT_ROOT/key.txt" ]]; then
    warn "No vault key found — run 'mc-vault init' to create a fresh vault"
  else
    ok "Vault key present"
  fi
fi

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
echo "  Next steps:"
echo "    1. Restart OpenClaw to load the plugins"
echo "    2. Verify:  mc-smoke"
if [[ ! -f "$VAULT_ROOT/key.txt" ]]; then
  echo "    3. Init vault: mc-vault init"
  echo "       Then restore secrets from ~/Desktop/vault.PLAINTEXT.txt (if present)"
fi
echo ""
