#!/usr/bin/env bash
# install.sh — miniclaw-os installer
#
# Installs system dependencies, OpenClaw, and miniclaw plugins + tools.
# Safe to re-run — skips anything already installed.
#
# Usage:
#   ./install.sh
#   ./install.sh --check   # verify only, no changes

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd 2>/dev/null)" || REPO_DIR="$(pwd)"
STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
MINICLAW_DIR="$STATE_DIR/miniclaw"
PROJECTS_DIR="$STATE_DIR/projects"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
LOG_FILE="/tmp/miniclaw-install.log"
ARCH=$(uname -m)

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== miniclaw install started $(date) ==="

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
fail() { echo -e "  ${RED}[✗]${NC} $1"; }
info() { echo -e "  ${BLUE}[i]${NC} $1"; }
step() { echo -e "\n${BOLD}── $1${NC}"; }
die()  { fail "$1"; exit 1; }

echo ""
echo -e "${BOLD}miniclaw-os installer${NC}"
echo "  source : $REPO_DIR"
echo "  install: $MINICLAW_DIR"
echo "  log    : $LOG_FILE"

[[ "$CHECK_ONLY" == true ]] && echo -e "\n  (check mode — no changes)\n"

# ── Homebrew prefix ───────────────────────────────────────────────────────────
[[ "$ARCH" == "arm64" ]] && BREW_PREFIX="/opt/homebrew" || BREW_PREFIX="/usr/local"

# -- Step 0: Detect & migrate existing OpenClaw install --------------------
step "Step 0: Existing OpenClaw detection"

ARCHIVE_DIR="$HOME/.openclaw-backup-$(date +%Y%m%d-%H%M%S)"
NEEDS_MIGRATION=false
OLD_CONFIG="" OLD_PLUGINS_DIR="" OLD_USER_DIR="" OLD_WORKSPACE="" OLD_CRON="" OLD_MEMORY=""

if [[ -d "$STATE_DIR" && ! -d "$STATE_DIR/miniclaw" && \
      ( -d "$STATE_DIR/plugins" || -d "$STATE_DIR/user" ) ]]; then
  # Existing vanilla OpenClaw install with real user data (not just openclaw.json from a prior install.sh run)
  info "Found existing OpenClaw install at $STATE_DIR"
  info "This looks like an upstream OpenClaw install (no miniclaw/ directory)."
  echo ""
  echo -e "  ${BOLD}MiniClaw will:${NC}"
  echo "    1. Archive your existing ~/.openclaw to $ARCHIVE_DIR"
  echo "    2. Install MiniClaw alongside OpenClaw"
  echo "    3. Import your plugins, config, and personal data"
  echo ""
  echo "  Your original data is NEVER deleted -- only archived."
  echo ""

  if [[ "$CHECK_ONLY" == true ]]; then
    warn "Migration needed -- run without --check to proceed"
  else
    MIGRATE_CONFIRM=""
    if { true < /dev/tty; } 2>/dev/null; then
      read -rp "  Archive and migrate? (y/N): " MIGRATE_CONFIRM < /dev/tty
    elif [ -t 0 ]; then
      read -rp "  Archive and migrate? (y/N): " MIGRATE_CONFIRM
    else
      MIGRATE_CONFIRM="y"
      info "No terminal -- proceeding automatically"
    fi

    if [[ "$MIGRATE_CONFIRM" == "y" || "$MIGRATE_CONFIRM" == "Y" ]]; then
      NEEDS_MIGRATION=true

      info "Archiving $STATE_DIR -> $ARCHIVE_DIR"
      cp -a "$STATE_DIR" "$ARCHIVE_DIR"
      ok "Archived to $ARCHIVE_DIR"

      # Catalog what they have
      [[ -f "$ARCHIVE_DIR/openclaw.json" ]] && OLD_CONFIG="$ARCHIVE_DIR/openclaw.json"
      [[ -d "$ARCHIVE_DIR/plugins" ]] && OLD_PLUGINS_DIR="$ARCHIVE_DIR/plugins"
      [[ -d "$ARCHIVE_DIR/user" ]] && OLD_USER_DIR="$ARCHIVE_DIR/user"
      [[ -d "$ARCHIVE_DIR/workspace" ]] && OLD_WORKSPACE="$ARCHIVE_DIR/workspace"
      [[ -d "$ARCHIVE_DIR/cron" ]] && OLD_CRON="$ARCHIVE_DIR/cron"
      [[ -d "$ARCHIVE_DIR/memory" ]] && OLD_MEMORY="$ARCHIVE_DIR/memory"

      echo ""
      info "Found in your existing install:"
      [[ -n "$OLD_CONFIG" ]] && ok "  openclaw.json (config)"
      [[ -n "$OLD_PLUGINS_DIR" ]] && ok "  plugins/ ($(ls "$OLD_PLUGINS_DIR" 2>/dev/null | wc -l | tr -d ' ') plugins)"
      [[ -n "$OLD_USER_DIR" ]] && ok "  user/ (personal data)"
      [[ -n "$OLD_WORKSPACE" ]] && ok "  workspace/ (identity files)"
      [[ -n "$OLD_CRON" ]] && ok "  cron/ (scheduled jobs)"
      [[ -n "$OLD_MEMORY" ]] && ok "  memory/ (memory files)"
      echo ""
    else
      echo "  Aborted. Your existing install is untouched."
      exit 0
    fi
  fi
elif [[ -d "$STATE_DIR/miniclaw" ]]; then
  ok "MiniClaw already installed -- updating in place"
else
  ok "Fresh install (no existing ~/.openclaw)"
fi


# ── Step 1: Homebrew ──────────────────────────────────────────────────────────
step "Step 1: Homebrew"

if command -v brew &>/dev/null; then
  ok "Homebrew already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "Homebrew not found"
else
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || die "Homebrew install failed"
  if [[ "$ARCH" == "arm64" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
      grep -q 'brew shellenv' "$p" 2>/dev/null \
        || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$p"
    done
  fi
  ok "Homebrew installed"
fi

brew_install() {
  local pkg="$1"
  local cmd="${2:-$1}"
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd already installed"
  elif [[ "$CHECK_ONLY" == true ]]; then
    warn "$cmd not found"
  else
    info "Installing $pkg..."
    brew install "$pkg" && ok "$pkg installed"
  fi
}

# ── Step 2: Core deps ─────────────────────────────────────────────────────────
step "Step 2: Core dependencies"

# Node.js
if command -v node &>/dev/null && [[ $(node --version | tr -d 'v' | cut -d. -f1) -ge 18 ]]; then
  ok "Node.js $(node --version) already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "Node.js 18+ not found"
else
  info "Installing Node.js 22 LTS..."
  brew install node@22
  brew link --overwrite node@22 2>/dev/null || true
  NODE_PATH="$BREW_PREFIX/opt/node@22/bin"
  [[ -d "$NODE_PATH" && ":$PATH:" != *":$NODE_PATH:"* ]] && export PATH="$NODE_PATH:$PATH"
  for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
    grep -q 'node@22' "$p" 2>/dev/null \
      || echo "export PATH=\"$BREW_PREFIX/opt/node@22/bin:\$PATH\"" >> "$p"
  done
  ok "Node.js $(node --version) installed"
fi

brew_install git
brew_install python@3 python3
brew_install jq
brew_install age

# Git Butler (required for isolated per-card virtual branches)
GITBUTLER_BIN="/Applications/GitButler.app/Contents/MacOS/gitbutler-tauri"
if [[ -x "$GITBUTLER_BIN" ]]; then
  ok "Git Butler already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "Git Butler not found ($GITBUTLER_BIN)"
else
  info "Installing Git Butler..."
  brew install --cask gitbutler \
    && ok "Git Butler installed" \
    || warn "Git Butler install failed — download from https://gitbutler.com"
fi

# ── Step 3: Bun ───────────────────────────────────────────────────────────────
step "Step 3: Bun"

if command -v bun &>/dev/null || [[ -f "$HOME/.bun/bin/bun" ]]; then
  [[ -f "$HOME/.bun/bin/bun" ]] && export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "Bun not found"
else
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
    grep -q '.bun/bin' "$p" 2>/dev/null \
      || echo 'export PATH="$HOME/.bun/bin:$PATH"' >> "$p"
  done
  ok "Bun installed"
fi

# QMD
if command -v qmd &>/dev/null || [[ -f "$HOME/.bun/bin/qmd" ]]; then
  ok "QMD already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "QMD not found"
else
  bun install -g qmd 2>/dev/null && ok "QMD installed" \
    || warn "QMD install failed — run: bun install -g qmd"
fi

# ── Step 4: OpenClaw (from MiniClaw fork) ─────────────────────────────────────
step "Step 4: OpenClaw"

OPENCLAW_FORK="augmentedmike/openclaw"
OPENCLAW_NPM_SRC="github:$OPENCLAW_FORK"

if command -v openclaw &>/dev/null; then
  INSTALLED=$(openclaw --version 2>/dev/null | head -1 || echo "?")
  ok "OpenClaw $INSTALLED already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "OpenClaw not installed"
else
  info "Installing OpenClaw from $OPENCLAW_FORK..."
  npm install -g "$OPENCLAW_NPM_SRC" || die "OpenClaw install failed"
  ok "OpenClaw $(openclaw --version 2>/dev/null | head -1) installed"
fi

# Init dirs if needed
if [[ ! -d "$STATE_DIR" ]]; then
  [[ "$CHECK_ONLY" == true ]] && fail "$STATE_DIR not found" || mkdir -p "$STATE_DIR"
fi
if [[ "$STATE_DIR" != "$STATE_DIR" && ! -d "$STATE_DIR" ]]; then
  mkdir -p "$STATE_DIR"
fi

if [[ ! -f "$STATE_DIR/openclaw.json" ]]; then
  if [[ "$CHECK_ONLY" == true ]]; then
    warn "openclaw.json not found"
  else
    python3 - "$STATE_DIR/openclaw.json" <<'PYEOF'
import json, sys
cfg = {
  "meta": {},
  "agents": { "defaults": { "model": { "primary": "claude-sonnet-4-6" }, "compaction": { "mode": "safeguard" } } },
  "plugins": {}
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2); f.write("\n")
PYEOF
    ok "openclaw.json created at $STATE_DIR/openclaw.json"
  fi
else
  ok "openclaw.json found"
fi

[[ "$CHECK_ONLY" == true ]] && { echo -e "\n${GREEN}Check complete.${NC}\n"; exit 0; }

# ── Step 5: Directories ───────────────────────────────────────────────────────
step "Step 5: Directories"

mkdir -p "$MINICLAW_DIR/plugins" "$PROJECTS_DIR"
ok "~/.openclaw/miniclaw/"
ok "~/.openclaw/projects/"

# ── Step 6: Install plugins ───────────────────────────────────────────────────
step "Step 6: miniclaw plugins"

# Migrated plugins: install to $MINICLAW_DIR/<name>/ (standalone CLI)
MIGRATED_PLUGINS=(vault designer)

for migrated in "${MIGRATED_PLUGINS[@]}"; do
  src="$REPO_DIR/$migrated"
  dest="$MINICLAW_DIR/$migrated"
  if [[ ! -d "$src" ]]; then
    warn "Migrated plugin source not found: $src"
    continue
  fi
  already_exists=false
  [[ -d "$dest" ]] && already_exists=true
  rsync -a --exclude='node_modules' --exclude='.git' "$src/" "$dest/"
  $already_exists && ok "Updated:   $migrated (standalone)" || ok "Installed: $migrated (standalone)"
  # Make CLI executable
  [[ -f "$dest/cli" ]] && chmod +x "$dest/cli"
  [[ -f "$dest/cli.ts" ]] && chmod +x "$dest/cli.ts"
  # Install dependencies
  if [[ -f "$dest/package.json" ]]; then
    (cd "$dest" && bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null) \
      && ok "           deps installed" \
      || warn "           bun install failed in $migrated"
  fi
done

# Legacy plugins: install to $MINICLAW_DIR/plugins/mc-<name>/ (openclaw-hosted)
for plugin_src in "$REPO_DIR/plugins"/*/; do
  plugin_name="$(basename "$plugin_src")"
  plugin_dest="$MINICLAW_DIR/plugins/$plugin_name"
  already_exists=false
  [[ -d "$plugin_dest" ]] && already_exists=true
  rsync -a --exclude='node_modules' --exclude='.git' "$plugin_src" "$plugin_dest/"
  $already_exists && ok "Updated:   $plugin_name" || ok "Installed: $plugin_name"
  # Install dependencies so tests can run
  if [[ -f "$plugin_dest/package.json" ]]; then
    (cd "$plugin_dest" && bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null) \
      && ok "           deps installed" \
      || warn "           bun install failed in $plugin_name"
  fi
done

# ── Step 7: Patch openclaw.json ───────────────────────────────────────────────
step "Step 7: openclaw.json"

python3 - "$STATE_DIR/openclaw.json" "$MINICLAW_DIR" "$STATE_DIR" <<'PYEOF'
import json, sys, os

config_path, mcl_dir = sys.argv[1], sys.argv[2]
plugins_dir = os.path.join(mcl_dir, "plugins")

with open(config_path) as f:
    cfg = json.load(f)

p = cfg.setdefault("plugins", {})
p.setdefault("enabled", True)
p.setdefault("allow", [])
p.setdefault("load", {}).setdefault("paths", [])
p.setdefault("entries", {})

state_dir = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser("~/.openclaw")
bot_id = cfg.get("botId") or os.environ.get("OPENCLAW_BOT_ID") or ""

plugin_defaults = {
    "mc-board": {
        "enabled": True,
        "config": { "cardsDir": state_dir + "/USER/brain/cards", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "mc-board", "webPort": 4220 },
    },
    "mc-context": {
        "enabled": True,
        "config": { "windowMinutes": 60, "windowMinMessages": 10, "maxImagesInHistory": 2, "applyToChannels": True, "applyToDMs": True, "replaceMessages": True },
    },
    "mc-designer": {
        "enabled": True,
        "config": { "apiKey": "", "model": "gemini-3.1-flash-image-preview", "mediaDir": state_dir + "/media/designer", "defaultWidth": 1024, "defaultHeight": 1024, "vaultBin": mcl_dir + "/vault/cli" },
    },
    "mc-kb": {
        "enabled": True,
        "config": { "dbDir": state_dir + "/USER/brain/kb", "modelPath": "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "kb", "contextN": 3, "contextThreshold": 0.75 },
    },
    "mc-queue": {
        "enabled": True,
        "config": { "enabled": True, "haikuModel": "claude-haiku-4-5-20251001", "maxToolCallsPerTurn": 3, "applyToChannels": True, "applyToDMs": True, "tgLogChatId": "", "tgBotName": ("@" + bot_id) if bot_id else "", "boardUrl": "" },
    },
    "mc-soul": {
        "enabled": True,
        "config": {},
    },
    "mc-trust": {
        "enabled": True,
        "config": { "agentId": "am", "trustDir": state_dir + "/trust", "vaultBin": mcl_dir + "/vault/cli", "sessionTtlMs": 3600000 },
    },
    "mc-backup": {
        "enabled": True,
        "config": {},
    },
}

registered = []
for name, defaults in plugin_defaults.items():
    plugin_path = os.path.join(plugins_dir, name)
    if not os.path.isdir(plugin_path):
        continue
    if name not in p["allow"]: p["allow"].append(name)
    if plugin_path not in p["load"]["paths"]: p["load"]["paths"].append(plugin_path)
    if name not in p["entries"]: p["entries"][name] = defaults
    registered.append(name)

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2); f.write("\n")

print(f"  registered: {', '.join(registered)}")
PYEOF
ok "openclaw.json patched"

# ── Step 8: CLI tools ─────────────────────────────────────────────────────────
step "Step 8: CLI tools → $LOCAL_BIN"

mkdir -p "$LOCAL_BIN"
for bin_src in "$REPO_DIR/SYSTEM/bin"/*; do
  [[ -f "$bin_src" ]] || continue
  bin_name="$(basename "$bin_src")"
  # Migrated CLIs: symlink instead of copy (path derivation needs real location)
  [[ "$bin_name" == "mc-vault" ]] && continue
  [[ "$bin_name" == "mc" ]] && { ln -sf "$MINICLAW_DIR/SYSTEM/bin/mc" "$LOCAL_BIN/mc"; ok "Symlinked: mc → miniclaw/system/bin/mc"; continue; }
  cp "$bin_src" "$LOCAL_BIN/$bin_name"
  chmod +x "$LOCAL_BIN/$bin_name"
  ok "Installed: $bin_name"
done

# Symlink mc-vault → miniclaw/vault/cli (standalone plugin)
ln -sf "$MINICLAW_DIR/vault/cli" "$LOCAL_BIN/mc-vault"
ok "Symlinked: mc-vault → miniclaw/vault/cli"

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  warn "$LOCAL_BIN not in PATH — add to ~/.zshrc: export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  ok "$LOCAL_BIN in PATH"
fi

# ── Step 9: Directories ───────────────────────────────────────────────────────
step "Step 9: User directories"

USER_MEMORY_DIR="$STATE_DIR/USER/memory"
SOUL_BACKUPS_DIR="$STATE_DIR/soul-backups"

mkdir -p "$USER_MEMORY_DIR"
ok "~/.openclaw/USER/memory/"

mkdir -p "$SOUL_BACKUPS_DIR"
ok "~/.openclaw/soul-backups/"

# ── Step 10: QMD collections ──────────────────────────────────────────────────
step "Step 10: QMD collections"

if command -v qmd &>/dev/null || [[ -f "$HOME/.bun/bin/qmd" ]]; then
  export PATH="$HOME/.bun/bin:$PATH"

  if qmd collection list 2>/dev/null | grep -q "^mc-memory"; then
    ok "mc-memory collection already registered"
  else
    qmd collection add mc-memory "$USER_MEMORY_DIR" 2>/dev/null \
      && ok "mc-memory collection registered → $USER_MEMORY_DIR" \
      || warn "mc-memory registration failed — run: qmd collection add mc-memory $USER_MEMORY_DIR"
  fi
else
  warn "qmd not found — skipping collection setup"
fi

# ── Step 11: Vault ────────────────────────────────────────────────────────────
step "Step 11: Vault"

VAULT_ROOT="$MINICLAW_DIR/SYSTEM/vault"
MC_VAULT="$MINICLAW_DIR/vault/cli"

if [[ ! -f "$VAULT_ROOT/key.txt" ]]; then
  OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" init
  ok "Vault initialised"
else
  ok "Vault already initialised"
fi

# All secrets (gh-token, gmail-app-password, gemini-api-key) are collected
# in the am-setup onboarding wizard (port 4210) — not in the terminal installer.


# -- Step 15: Migrate data from archived OpenClaw install ------------------
if [[ "$NEEDS_MIGRATION" == true ]]; then
  step "Step 15: Migrating your OpenClaw data"

  # Import their openclaw.json settings (model prefs, auth, non-plugin config)
  if [[ -n "$OLD_CONFIG" && -f "$OLD_CONFIG" ]]; then
    info "Merging your openclaw.json settings..."
    python3 - "$STATE_DIR/openclaw.json" "$OLD_CONFIG" <<'MERGE_PYEOF'
import json, sys

new_path, old_path = sys.argv[1], sys.argv[2]
with open(new_path) as f: new_cfg = json.load(f)
with open(old_path) as f: old_cfg = json.load(f)

# Preserve their model preferences
if "agents" in old_cfg:
    old_agents = old_cfg["agents"]
    new_agents = new_cfg.setdefault("agents", {})
    if "defaults" in old_agents:
        old_defaults = old_agents["defaults"]
        new_defaults = new_agents.setdefault("defaults", {})
        # Keep their model choice if they had one
        if "model" in old_defaults:
            new_defaults["model"] = old_defaults["model"]
        # Keep their compaction settings
        if "compaction" in old_defaults:
            new_defaults["compaction"] = old_defaults["compaction"]

# Preserve their auth config
if "auth" in old_cfg:
    new_cfg["auth"] = old_cfg["auth"]

# Preserve their gateway config (but not the token -- that stays in vault)
if "gateway" in old_cfg:
    old_gw = old_cfg["gateway"]
    new_gw = new_cfg.setdefault("gateway", {})
    for key in ("bind", "port", "tailscale"):
        if key in old_gw:
            new_gw[key] = old_gw[key]

# Preserve any custom meta
if "meta" in old_cfg and old_cfg["meta"]:
    new_cfg.setdefault("meta", {}).update(old_cfg["meta"])

with open(new_path, "w") as f:
    json.dump(new_cfg, f, indent=2)
    f.write("\n")
MERGE_PYEOF
    ok "Merged model prefs, auth, and gateway settings"
  fi

  # Import their user data (board cards, KB, personal state)
  if [[ -n "$OLD_USER_DIR" ]]; then
    info "Importing your user data..."
    # Merge into new user dir -- rsync with no-clobber so we dont overwrite miniclaw defaults
    rsync -a --ignore-existing "$OLD_USER_DIR/" "$STATE_DIR/USER/"
    ok "Imported user data (board cards, KB, personal state)"
  fi

  # Import their workspace (SOUL.md, IDENTITY.md, MEMORY.md, etc.)
  if [[ -n "$OLD_WORKSPACE" ]]; then
    info "Importing your workspace files..."
    rsync -a --ignore-existing "$OLD_WORKSPACE/" "$STATE_DIR/workspace/"
    ok "Imported workspace (identity files, memory)"
  fi

  # Import their memory files
  if [[ -n "$OLD_MEMORY" ]]; then
    info "Importing your memory files..."
    mkdir -p "$STATE_DIR/memory"
    rsync -a --ignore-existing "$OLD_MEMORY/" "$STATE_DIR/memory/"
    ok "Imported memory files"
  fi

  # Import their cron jobs
  if [[ -n "$OLD_CRON" ]]; then
    info "Importing your cron jobs..."
    mkdir -p "$STATE_DIR/cron"
    rsync -a --ignore-existing "$OLD_CRON/" "$STATE_DIR/cron/"
    ok "Imported cron jobs"
  fi

  # Import their upstream openclaw plugins (non-miniclaw plugins)
  if [[ -n "$OLD_PLUGINS_DIR" ]]; then
    info "Importing your OpenClaw plugins..."
    IMPORTED_COUNT=0
    for old_plugin in "$OLD_PLUGINS_DIR"/*/; do
      plugin_name="$(basename "$old_plugin")"
      # Skip if miniclaw already has this plugin (ours takes precedence)
      if [[ -d "$MINICLAW_DIR/plugins/$plugin_name" ]]; then
        info "  Skipped $plugin_name (MiniClaw version installed)"
        continue
      fi
      # Import to the openclaw plugins dir (not miniclaw plugins)
      dest="$STATE_DIR/plugins/$plugin_name"
      mkdir -p "$STATE_DIR/plugins"
      rsync -a --exclude='node_modules' "$old_plugin" "$dest/"
      ok "  Imported: $plugin_name (upstream OpenClaw plugin)"
      IMPORTED_COUNT=$((IMPORTED_COUNT + 1))

      # Register in openclaw.json
      python3 - "$STATE_DIR/openclaw.json" "$plugin_name" "$dest" <<'REG_PYEOF'
import json, sys
config_path, name, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(config_path) as f: cfg = json.load(f)
p = cfg.setdefault("plugins", {})
p.setdefault("allow", [])
p.setdefault("load", {}).setdefault("paths", [])
p.setdefault("entries", {})
if name not in p["allow"]: p["allow"].append(name)
if path not in p["load"]["paths"]: p["load"]["paths"].append(path)
if name not in p["entries"]: p["entries"][name] = {"enabled": True, "config": {}}
with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2); f.write("\n")
REG_PYEOF
    done
    ok "Imported $IMPORTED_COUNT upstream OpenClaw plugin(s)"
  fi

  echo ""
  ok "Migration complete!"
  info "Your original install is archived at: $ARCHIVE_DIR"
  info "If anything looks wrong, restore with: cp -a $ARCHIVE_DIR/ $STATE_DIR/"
  echo ""
fi


# ── Step 12: Brain board crons ────────────────────────────────────────────────
step "Step 12: Brain board cron workers"

# Write cron jobs directly to jobs.json so OpenClaw picks them up on startup.
# No running gateway required.
CRON_DIR="$STATE_DIR/cron"
CRON_FILE="$CRON_DIR/jobs.json"
mkdir -p "$CRON_DIR"

# Merge board worker jobs into jobs.json (preserves any existing jobs)
python3 << PYEOF
import json, uuid, os, sys

cron_file = "$CRON_FILE"

# Load existing
store = {"version": 1, "jobs": []}
try:
    with open(cron_file) as f:
        store = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    pass

existing_names = {j.get("name") for j in store.get("jobs", [])}

workers = [
    {
        "name": "board-worker-backlog",
        "schedule": {"kind": "cron", "expr": "*/5 * * * *"},
        "sessionTarget": "isolated",
        "model": "claude-haiku-4-5-20251001",
        "payload": {
            "kind": "agentTurn",
            "timeoutSeconds": 600,
            "messageFile": "prompts/board-worker-backlog.md"
        },
        "delivery": {"mode": "none"},
        "enabled": True
    },
    {
        "name": "board-worker-in-progress",
        "schedule": {"kind": "cron", "expr": "1-59/5 * * * *"},
        "sessionTarget": "isolated",
        "model": "claude-haiku-4-5-20251001",
        "payload": {
            "kind": "agentTurn",
            "timeoutSeconds": 600,
            "messageFile": "prompts/board-worker-in-progress.md"
        },
        "delivery": {"mode": "none"},
        "enabled": True
    },
    {
        "name": "board-worker-in-review",
        "schedule": {"kind": "cron", "expr": "2-59/5 * * * *"},
        "sessionTarget": "isolated",
        "model": "claude-haiku-4-5-20251001",
        "payload": {
            "kind": "agentTurn",
            "timeoutSeconds": 600,
            "messageFile": "prompts/board-worker-in-review.md"
        },
        "delivery": {"mode": "none"},
        "enabled": True
    }
]

added = 0
for w in workers:
    if w["name"] not in existing_names:
        w["id"] = str(uuid.uuid4())
        store.setdefault("jobs", []).append(w)
        added += 1

os.makedirs(os.path.dirname(cron_file), exist_ok=True)
with open(cron_file, "w") as f:
    json.dump(store, f, indent=2)

if added:
    print(f"  Added {added} board worker(s) to jobs.json")
else:
    print("  Board workers already in jobs.json")
PYEOF
ok "Board cron workers written to $CRON_FILE"

# Copy cron prompts
if [[ -d "$REPO_DIR/cron/prompts" ]]; then
  mkdir -p "$CRON_DIR/prompts"
  cp -r "$REPO_DIR/cron/prompts/"* "$CRON_DIR/prompts/" 2>/dev/null || true
  ok "Cron prompts copied"
fi

# ── Step 13: Shell env ────────────────────────────────────────────────────────
step "Step 13: Shell environment"

for rcfile in "$HOME/.zshrc"; do
  [[ -f "$rcfile" ]] || continue

  if grep -q "OPENCLAW_STATE_DIR" "$rcfile"; then
    ok "OPENCLAW_STATE_DIR already in $rcfile"
  else
    {
      echo ""
      echo "# OpenClaw / MiniClaw"
      echo "export OPENCLAW_STATE_DIR=\"$STATE_DIR\""
    } >> "$rcfile"
    ok "Added OPENCLAW_STATE_DIR=$STATE_DIR to $rcfile"
  fi

  if grep -q "MINICLAW_HOME" "$rcfile"; then
    ok "MINICLAW_HOME already in $rcfile"
  else
    echo "export MINICLAW_HOME=\"$MINICLAW_DIR\"" >> "$rcfile"
    ok "Added MINICLAW_HOME=$MINICLAW_DIR to $rcfile"
  fi

  if grep -q "alias oc=" "$rcfile"; then
    ok "oc alias already in $rcfile"
  else
    echo "alias oc='openclaw'" >> "$rcfile"
    ok "Added oc alias to $rcfile"
  fi
done

# ── Step 14: Board web build + LaunchAgent ────────────────────────────────────
step "Step 14: Board web server"

BOARD_WEB_DIR="$MINICLAW_DIR/plugins/mc-board/web"
if [[ -f "$BOARD_WEB_DIR/package.json" ]]; then
  info "Building board web..."
  (cd "$BOARD_WEB_DIR" && npm install --production=false 2>&1 | tail -3 && npx next build 2>&1 | tail -5) \
    && ok "Board web built" \
    || warn "Board web build failed — run: cd $BOARD_WEB_DIR && npm install && npx next build"
fi

BOARD_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"
mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$BOARD_PLIST" 2>/dev/null || true
cat > "$BOARD_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.board-web</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node || echo /opt/homebrew/bin/node)</string>
    <string>$MINICLAW_DIR/plugins/mc-board/web/node_modules/.bin/next</string>
    <string>start</string>
    <string>-p</string>
    <string>4220</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$MINICLAW_DIR/plugins/mc-board/web</string>
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
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
  </dict>
</dict>
</plist>
PLIST
mkdir -p "$STATE_DIR/logs"
launchctl load "$BOARD_PLIST" 2>/dev/null && ok "Board web LaunchAgent loaded (port 4220)" \
  || warn "LaunchAgent created — run: launchctl load $BOARD_PLIST"

# ── Step 14b: Default board projects (deferred to setup wizard) ──────────────
step "Step 14b: Default board projects"
info "Board DB and default projects will be seeded when the setup wizard completes"
info "(The wizard sets the bot ID from your Telegram username)"
ok "Deferred to setup wizard"

# ── Step 15b: AM Setup Wizard LaunchAgent ─────────────────────────────────
step "Step 15b: AM Setup Wizard LaunchAgent"

# Reset onboarding state so the wizard always runs after install
rm -f "$STATE_DIR/USER/setup-state.json"

SETUP_APP_DIR="$MINICLAW_DIR/apps/am-setup"
SETUP_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.am-setup.plist"

# Copy am-setup app into miniclaw dir
if [[ -d "$REPO_DIR/apps/am-setup" ]]; then
  mkdir -p "$MINICLAW_DIR/apps"
  rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' "$REPO_DIR/apps/am-setup/" "$SETUP_APP_DIR/"
  ok "am-setup app copied"
  # Install dependencies and build
  if [[ -f "$SETUP_APP_DIR/package.json" ]]; then
    (cd "$SETUP_APP_DIR" && npm install --production=false 2>&1 | tail -3 && npm run build 2>&1 | tail -5) \
      && ok "am-setup built" \
      || warn "am-setup build failed — run: cd $SETUP_APP_DIR && npm install && npm run build"
  fi
fi

mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$SETUP_PLIST" 2>/dev/null || true
cat > "$SETUP_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.am-setup</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node || echo /opt/homebrew/bin/node)</string>
    <string>$SETUP_APP_DIR/node_modules/.bin/next</string>
    <string>start</string>
    <string>-p</string>
    <string>4210</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SETUP_APP_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/logs/am-setup.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/am-setup.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>
PLIST
mkdir -p "$STATE_DIR/logs"
launchctl load "$SETUP_PLIST" 2>/dev/null && ok "AM Setup LaunchAgent loaded (port 4210)" \
  || warn "LaunchAgent created — run: launchctl load $SETUP_PLIST"

# ── Step 16: Import shared KB ─────────────────────────────────────────────────
step "Step 16: Shared knowledge base"

KB_BUNDLE_URL="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/shared/kb/knowledge.json"
KB_TMP="/tmp/miniclaw-kb-import-$$.json"

(
  curl -sfL "$KB_BUNDLE_URL" -o "$KB_TMP" 2>/dev/null
  if [[ -f "$KB_TMP" && -s "$KB_TMP" ]]; then
    # Only import if there are entries
    entry_count=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get('entries',[])))" "$KB_TMP" 2>/dev/null || echo "0")
    if [[ "$entry_count" -gt 0 ]]; then
      openclaw mc-kb import "$KB_TMP" 2>/dev/null
    fi
    rm -f "$KB_TMP"
  fi
) &
ok "Shared KB import started in background"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${NC}"
echo ""
echo "  Setup:   http://localhost:4210"
echo "  Board:   http://localhost:4220"
echo "  Verify:  mc-smoke"
echo ""

# Open the onboarding wizard in the default browser
if command -v open &>/dev/null; then
  sleep 2  # give LaunchAgents a moment to start
  open "http://localhost:4210"
fi
