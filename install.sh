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

# Run a command quietly — output goes to log file only, not terminal
run_quiet() { "$@" >>"$LOG_FILE" 2>&1; }

# Progress helpers: show [ ] line, then overwrite with result
progress() { echo -ne "  ${BLUE}[ ]${NC} $1\r"; }
progress_ok()   { echo -e "  ${GREEN}[✓]${NC} $1\033[K"; }
progress_fail() { echo -e "  ${RED}[✗]${NC} $1\033[K"; }
progress_warn() { echo -e "  ${YELLOW}[!]${NC} $1\033[K"; }

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
OLD_CONFIG="" OLD_PLUGINS_DIR="" OLD_USER_DIR="" OLD_WORKSPACE="" OLD_CRON="" OLD_MEMORY="" OLD_PROJECTS=""

# If bootstrap already evacuated ~/.openclaw, use that as the migration source
EVAC_DIR="${OPENCLAW_EVAC_DIR:-}"

catalog_old_install() {
  local src="$1"
  [[ -f "$src/openclaw.json" ]] && OLD_CONFIG="$src/openclaw.json"
  [[ -d "$src/plugins" ]] && OLD_PLUGINS_DIR="$src/plugins"
  # OpenClaw uses lowercase "user", MiniClaw uses "USER"
  [[ -d "$src/user" ]] && OLD_USER_DIR="$src/user"
  [[ -d "$src/USER" ]] && OLD_USER_DIR="$src/USER"
  [[ -d "$src/workspace" ]] && OLD_WORKSPACE="$src/workspace"
  [[ -d "$src/cron" ]] && OLD_CRON="$src/cron"
  [[ -d "$src/memory" ]] && OLD_MEMORY="$src/memory"
  [[ -d "$src/projects" ]] && OLD_PROJECTS="$src/projects"

  echo ""
  info "Found in previous install:"
  [[ -n "$OLD_CONFIG" ]] && ok "  openclaw.json (config)"
  [[ -n "$OLD_PLUGINS_DIR" ]] && ok "  plugins/ ($(ls "$OLD_PLUGINS_DIR" 2>/dev/null | wc -l | tr -d ' ') plugins)"
  [[ -n "$OLD_USER_DIR" ]] && ok "  user/ (personal data)"
  [[ -n "$OLD_WORKSPACE" ]] && ok "  workspace/ (identity files)"
  [[ -n "$OLD_CRON" ]] && ok "  cron/ (scheduled jobs)"
  [[ -n "$OLD_MEMORY" ]] && ok "  memory/ (memory files)"
  [[ -n "${OLD_PROJECTS:-}" ]] && ok "  projects/ ($(ls "$OLD_PROJECTS" 2>/dev/null | wc -l | tr -d ' ') project repos)"
  echo ""
}

if [[ -n "$EVAC_DIR" && -d "$EVAC_DIR" ]]; then
  # Bootstrap already moved the old install — use it as migration source
  info "Previous install evacuated by bootstrap to $EVAC_DIR"
  NEEDS_MIGRATION=true
  ARCHIVE_DIR="$EVAC_DIR"
  catalog_old_install "$EVAC_DIR"
elif [[ -d "$STATE_DIR" && ! -d "$STATE_DIR/miniclaw" && \
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

      catalog_old_install "$ARCHIVE_DIR"
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


# ── Step 0b: Pre-flight collision checks ─────────────────────────────────────
step "Step 0b: Pre-flight collision checks"

COLLISIONS=0

# Skip port checks — the board web app (4220) is the setup wizard and may
# be the process that launched this install. Don't kill it.
ok "Port collision checks skipped (web app may be running install)"

# Check for existing com.miniclaw.* LaunchAgents from a different install
for label in com.miniclaw.board-web; do
  plist="$HOME/Library/LaunchAgents/$label.plist"
  if [[ -f "$plist" ]]; then
    PLIST_STATE_DIR=$(grep -A1 'OPENCLAW_STATE_DIR' "$plist" 2>/dev/null | tail -1 | sed 's/.*<string>//;s|</string>.*||' || true)
    if [[ -n "$PLIST_STATE_DIR" && "$PLIST_STATE_DIR" != "$STATE_DIR" ]]; then
      warn "LaunchAgent $label exists pointing to $PLIST_STATE_DIR (not $STATE_DIR)"
      warn "  Will be overwritten. Old plist backed up to $plist.bak"
      cp "$plist" "$plist.bak" 2>/dev/null || true
      COLLISIONS=$((COLLISIONS + 1))
    else
      ok "$label plist already targets $STATE_DIR (will be updated)"
    fi
  else
    ok "$label not yet installed"
  fi
done

# Check for system crontab entries referencing .openclaw or miniclaw
CRONTAB_HITS=$(crontab -l 2>/dev/null | grep -c 'openclaw\|miniclaw' || true)
if [[ "$CRONTAB_HITS" -gt 0 ]]; then
  warn "Found $CRONTAB_HITS crontab entries referencing openclaw/miniclaw"
  warn "  (MiniClaw uses its own cron worker, not system crontab — these may be stale)"
  crontab -l 2>/dev/null | grep 'openclaw\|miniclaw' | while read -r line; do
    warn "    $line"
  done
  COLLISIONS=$((COLLISIONS + 1))
fi

# Check for other LaunchAgents/daemons that reference .openclaw
for plist in "$HOME/Library/LaunchAgents/"*.plist /Library/LaunchDaemons/*.plist; do
  [[ -f "$plist" ]] || continue
  [[ "$(basename "$plist")" == com.miniclaw.* ]] && continue
  if grep -q '\.openclaw' "$plist" 2>/dev/null; then
    warn "Non-miniclaw plist references .openclaw: $(basename "$plist")"
    warn "  This service may break if the home directory is relocated"
    COLLISIONS=$((COLLISIONS + 1))
  fi
done

if [[ "$COLLISIONS" -gt 0 ]]; then
  echo ""
  warn "$COLLISIONS collision(s) detected (see above)"
  warn "Install will continue — but review the warnings above."
  echo ""
else
  ok "No collisions detected"
fi


# ── Step 1: Homebrew ──────────────────────────────────────────────────────────
step "Step 1: Homebrew"

if command -v brew &>/dev/null; then
  ok "Homebrew already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "Homebrew not found"
else
  info "Installing Homebrew..."
  run_quiet /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
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
    run_quiet brew install "$pkg" && ok "$pkg installed"
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
  run_quiet brew install node@22
  run_quiet brew link --overwrite node@22 || true
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
  run_quiet brew install --cask gitbutler \
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
  run_quiet bash -c "$(curl -fsSL https://bun.sh/install)"
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
  run_quiet bun install -g qmd && ok "QMD installed" \
    || warn "QMD install failed — run: bun install -g qmd"
fi

# ── Step 4: OpenClaw (from MiniClaw fork) ─────────────────────────────────────
step "Step 4: OpenClaw"

# Read pinned openclaw version from MANIFEST.json
OPENCLAW_NPM_PKG=$(python3 -c "
import json
m = json.load(open('$REPO_DIR/MANIFEST.json'))
print(m.get('openclaw', {}).get('npm', '@miniclaw_official/openclaw'))
" 2>/dev/null || echo "@miniclaw_official/openclaw")

# Remove any Homebrew openclaw — we always use the npm fork
if brew list openclaw &>/dev/null 2>&1; then
  if [[ "$CHECK_ONLY" == true ]]; then
    warn "Homebrew openclaw installed — will be removed in favour of npm fork"
  else
    info "Removing Homebrew openclaw (using npm fork instead)..."
    run_quiet brew uninstall openclaw && ok "Removed Homebrew openclaw" \
      || warn "Could not remove Homebrew openclaw — remove manually: brew uninstall openclaw"
  fi
fi

# Check if the correct npm fork is installed (not upstream)
CORRECT_FORK=false
if command -v openclaw &>/dev/null; then
  INSTALLED_PKG=$(npm list -g 2>/dev/null | grep -o '@miniclaw_official/openclaw' || true)
  if [[ -n "$INSTALLED_PKG" ]]; then
    CORRECT_FORK=true
    INSTALLED=$(openclaw --version 2>/dev/null | head -1 || echo "?")
    ok "OpenClaw $INSTALLED (fork: $OPENCLAW_NPM_PKG)"
  fi
fi

if [[ "$CORRECT_FORK" == false ]]; then
  if [[ "$CHECK_ONLY" == true ]]; then
    if command -v openclaw &>/dev/null; then
      warn "openclaw found but not the MiniClaw fork ($OPENCLAW_NPM_PKG)"
    else
      fail "OpenClaw not installed"
    fi
  else
    # Uninstall upstream openclaw if present
    if command -v openclaw &>/dev/null; then
      info "Replacing upstream openclaw with MiniClaw fork..."
      run_quiet npm uninstall -g openclaw 2>/dev/null || true
    fi
    info "Installing OpenClaw from $OPENCLAW_NPM_PKG..."
    run_quiet npm install -g "$OPENCLAW_NPM_PKG" || die "OpenClaw install failed"
    ok "OpenClaw $(openclaw --version 2>/dev/null | head -1) installed (fork: $OPENCLAW_NPM_PKG)"
  fi
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

# Copy MANIFEST.json so the CLI can read the MiniClaw version at runtime
if [[ -f "$REPO_DIR/MANIFEST.json" ]]; then
  cp "$REPO_DIR/MANIFEST.json" "$MINICLAW_DIR/MANIFEST.json"
  ok "MANIFEST.json (v$(python3 -c "import json; print(json.load(open('$MINICLAW_DIR/MANIFEST.json')).get('version','?'))"))"
fi

# ── Step 6: Install plugins ───────────────────────────────────────────────────
step "Step 6: miniclaw plugins"

# Migrated plugins: install to $MINICLAW_DIR/<name>/ (standalone CLI)
MIGRATED_PLUGINS=(vault designer)

for migrated in "${MIGRATED_PLUGINS[@]}"; do
  src="$REPO_DIR/$migrated"
  dest="$MINICLAW_DIR/$migrated"
  if [[ ! -d "$src" ]]; then
    warn "Source not found: $src"
    continue
  fi
  progress "Installing $migrated (standalone)"
  rsync -a --exclude='node_modules' --exclude='.git' "$src/" "$dest/"
  [[ -f "$dest/cli" ]] && chmod +x "$dest/cli"
  [[ -f "$dest/cli.ts" ]] && chmod +x "$dest/cli.ts"
  if [[ -f "$dest/package.json" ]]; then
    if (cd "$dest" && run_quiet bun install --frozen-lockfile 2>/dev/null || run_quiet bun install); then
      progress_ok "Installed $migrated (standalone)"
    else
      progress_warn "Installed $migrated (standalone) — deps failed"
    fi
  else
    progress_ok "Installed $migrated (standalone)"
  fi
done

# Legacy plugins: install to $MINICLAW_DIR/plugins/mc-<name>/ (openclaw-hosted)
PLUGIN_COUNT=0
PLUGIN_FAIL=0
for plugin_src in "$REPO_DIR/plugins"/*/; do
  plugin_name="$(basename "$plugin_src")"
  plugin_dest="$MINICLAW_DIR/plugins/$plugin_name"
  progress "Installing $plugin_name"
  rsync -a --exclude='node_modules' --exclude='.git' "$plugin_src" "$plugin_dest/"
  if [[ -f "$plugin_dest/package.json" ]]; then
    if (cd "$plugin_dest" && run_quiet bun install --frozen-lockfile 2>/dev/null || run_quiet bun install); then
      progress_ok "Installed $plugin_name"
    else
      progress_warn "Installed $plugin_name — deps failed"
      PLUGIN_FAIL=$((PLUGIN_FAIL + 1))
    fi
  else
    progress_ok "Installed $plugin_name"
  fi
  PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
done
ok "$PLUGIN_COUNT plugins installed"
[[ "$PLUGIN_FAIL" -gt 0 ]] && warn "$PLUGIN_FAIL plugin(s) had dependency failures (see $LOG_FILE)"

# ── Step 7: Patch openclaw.json ───────────────────────────────────────────────
step "Step 7: openclaw.json"

# Clean unknown top-level keys that cause openclaw config validation to fail
python3 - "$STATE_DIR/openclaw.json" <<'CLEANEOF'
import json, sys
config_path = sys.argv[1]
with open(config_path) as f:
    cfg = json.load(f)
known_keys = {"meta", "agents", "plugins", "auth", "gateway", "logging", "channels", "skills", "secrets", "browser", "canvas", "sandbox", "sessions"}
removed = [k for k in list(cfg.keys()) if k not in known_keys]
for k in removed:
    del cfg[k]
if removed:
    with open(config_path, "w") as f:
        json.dump(cfg, f, indent=2); f.write("\n")
    print(f"  Removed unknown keys: {', '.join(removed)}")
CLEANEOF

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

# Per-plugin config overrides (only for plugins that need non-empty config)
plugin_config_overrides = {
    "mc-board": { "cardsDir": state_dir + "/USER/brain/cards", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "mc-board", "webPort": 4220 },
    "mc-context": { "windowMinutes": 60, "windowMinMessages": 10, "maxImagesInHistory": 2, "applyToChannels": True, "applyToDMs": True, "replaceMessages": True },
    "mc-designer": { "apiKey": "", "model": "gemini-3.1-flash-image-preview", "mediaDir": state_dir + "/media/designer", "defaultWidth": 1024, "defaultHeight": 1024, "vaultBin": mcl_dir + "/vault/cli" },
    "mc-kb": { "dbDir": state_dir + "/USER/brain/kb", "modelPath": "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "kb", "contextN": 3, "contextThreshold": 0.75 },
    "mc-queue": { "enabled": True, "haikuModel": "claude-haiku-4-5-20251001", "maxToolCallsPerTurn": 3, "applyToChannels": True, "applyToDMs": True, "tgLogChatId": "", "tgBotName": "", "boardUrl": "" },
    "mc-trust": { "agentId": "am", "trustDir": state_dir + "/trust", "vaultBin": mcl_dir + "/vault/cli", "sessionTtlMs": 3600000 },
}

# Register ALL plugins found in the plugins directory
registered = []
for name in sorted(os.listdir(plugins_dir)):
    plugin_path = os.path.join(plugins_dir, name)
    if not os.path.isdir(plugin_path):
        continue
    if name == "shared":
        continue
    if name not in p["allow"]: p["allow"].append(name)
    if plugin_path not in p["load"]["paths"]: p["load"]["paths"].append(plugin_path)
    if name not in p["entries"]:
        cfg = plugin_config_overrides.get(name, {})
        p["entries"][name] = {"enabled": True, "config": cfg}
    registered.append(name)

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2); f.write("\n")

print(f"  registered: {', '.join(registered)}")
PYEOF
ok "openclaw.json patched"

# ── Step 8: CLI tools → SYSTEM/bin ────────────────────────────────────────────
step "Step 8: CLI tools"

SYSTEM_BIN="$MINICLAW_DIR/SYSTEM/bin"
USER_BIN="$STATE_DIR/USER/bin"
mkdir -p "$SYSTEM_BIN" "$USER_BIN"

for bin_src in "$REPO_DIR/SYSTEM/bin"/*; do
  [[ -f "$bin_src" ]] || continue
  bin_name="$(basename "$bin_src")"
  cp "$bin_src" "$SYSTEM_BIN/$bin_name"
  chmod +x "$SYSTEM_BIN/$bin_name"
  ok "Installed: $bin_name → SYSTEM/bin/"
done

# mc-vault is the vault CLI
cp "$MINICLAW_DIR/vault/cli" "$SYSTEM_BIN/mc-vault" 2>/dev/null && chmod +x "$SYSTEM_BIN/mc-vault" \
  && ok "Installed: mc-vault → SYSTEM/bin/"

ok "SYSTEM/bin: $(ls "$SYSTEM_BIN" | wc -l | tr -d ' ') tools"

# Generate CLI wrappers for every plugin
step "Step 8b: Plugin CLI wrappers"

PLUGINS_DIR="$MINICLAW_DIR/plugins"
GENERATED=0
for plugin_dir in "$PLUGINS_DIR"/mc-*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name="$(basename "$plugin_dir")"
  wrapper="$SYSTEM_BIN/$plugin_name"
  # Don't overwrite hand-written tools
  [[ -f "$wrapper" ]] && continue
  cat > "$wrapper" <<WRAPPER
#!/usr/bin/env bash
exec openclaw $plugin_name "\$@"
WRAPPER
  chmod +x "$wrapper"
  GENERATED=$((GENERATED + 1))
done
ok "Generated $GENERATED plugin CLI wrappers"
ok "SYSTEM/bin total: $(ls "$SYSTEM_BIN" | wc -l | tr -d ' ') tools"

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
# in the board web setup wizard (port 4220) — not in the terminal installer.


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

  # Import their project repos (openclaw fork, other repos)
  if [[ -n "${OLD_PROJECTS:-}" ]]; then
    info "Importing your project repos..."
    mkdir -p "$PROJECTS_DIR"
    PROJ_IMPORTED=0
    for old_proj in "$OLD_PROJECTS"/*/; do
      proj_name="$(basename "$old_proj")"
      dest="$PROJECTS_DIR/$proj_name"
      if [[ -d "$dest" ]]; then
        info "  Skipped $proj_name (already exists at $dest)"
        continue
      fi
      rsync -a --exclude='node_modules' "$old_proj" "$dest/"
      ok "  Imported: $proj_name"
      PROJ_IMPORTED=$((PROJ_IMPORTED + 1))
    done
    ok "Imported $PROJ_IMPORTED project repo(s)"
  fi

  # Migrate system crontab entries that reference the old install path
  if crontab -l 2>/dev/null | grep -q "$ARCHIVE_DIR\|\.openclaw"; then
    info "Migrating crontab entries..."
    CRONTAB_BEFORE=$(crontab -l 2>/dev/null)
    # Rewrite old paths to new STATE_DIR
    CRONTAB_AFTER=$(echo "$CRONTAB_BEFORE" | sed "s|$ARCHIVE_DIR|$STATE_DIR|g" | sed "s|\$HOME/\.openclaw|$STATE_DIR|g" | sed "s|$HOME/\.openclaw|$STATE_DIR|g")
    if [[ "$CRONTAB_BEFORE" != "$CRONTAB_AFTER" ]]; then
      echo "$CRONTAB_AFTER" | crontab -
      CHANGED=$(diff <(echo "$CRONTAB_BEFORE") <(echo "$CRONTAB_AFTER") | grep '^[<>]' | wc -l | tr -d ' ')
      ok "Updated $CHANGED crontab line(s) to point to $STATE_DIR"
    else
      ok "No crontab entries needed updating"
    fi
  fi

  echo ""
  ok "Migration complete!"
  info "Your original install is archived at: $ARCHIVE_DIR"
  info "If anything looks wrong, restore with: cp -a $ARCHIVE_DIR/ $STATE_DIR/"
  echo ""
fi


# ── Step 12: Cron workers (from MANIFEST.json) ───────────────────────────────
step "Step 12: Cron workers"

# Write cron jobs directly to jobs.json so OpenClaw picks them up on startup.
# Reads expected crons from MANIFEST.json — no running gateway required.
CRON_DIR="$STATE_DIR/cron"
CRON_FILE="$CRON_DIR/jobs.json"
mkdir -p "$CRON_DIR"

# Merge cron jobs from MANIFEST into jobs.json (preserves any existing jobs)
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

# Read expected crons from MANIFEST.json
manifest_path = os.path.join("$REPO_DIR", "MANIFEST.json")
try:
    with open(manifest_path) as f:
        manifest = json.load(f)
    manifest_crons = manifest.get("crons", [])
except (FileNotFoundError, json.JSONDecodeError):
    manifest_crons = []

workers = []
for mc in manifest_crons:
    w = {
        "name": mc["name"],
        "schedule": mc["schedule"],
        "sessionTarget": mc.get("sessionTarget", "isolated"),
        "model": mc.get("model", "claude-haiku-4-5-20251001"),
        "payload": {
            "kind": "agentTurn",
            "timeoutSeconds": mc.get("timeoutSeconds", 600),
            "messageFile": f"prompts/{mc['name']}.md"
        },
        "delivery": {"mode": "none"},
        "enabled": True
    }
    workers.append(w)

# Fallback if MANIFEST had no crons
if not workers:
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
ok "Cron workers written to $CRON_FILE"

# Copy cron prompts
if [[ -d "$REPO_DIR/cron/prompts" ]]; then
  mkdir -p "$CRON_DIR/prompts"
  cp -r "$REPO_DIR/cron/prompts/"* "$CRON_DIR/prompts/" 2>/dev/null || true
  ok "Cron prompts copied"
fi

# ── Step 13: Shell env ────────────────────────────────────────────────────────
step "Step 13: Shell environment"

# Env vars and PATH go in .zshenv so non-interactive shells (cron, agents,
# IDE terminals) also pick them up.  Aliases stay in .zshrc (interactive only).
ZSHENV="$HOME/.zshenv"
touch "$ZSHENV"

if grep -q "OPENCLAW_STATE_DIR" "$ZSHENV"; then
  ok "OPENCLAW_STATE_DIR already in $ZSHENV"
else
  {
    echo ""
    echo "# OpenClaw / MiniClaw"
    echo "export OPENCLAW_STATE_DIR=\"$STATE_DIR\""
  } >> "$ZSHENV"
  ok "Added OPENCLAW_STATE_DIR=$STATE_DIR to $ZSHENV"
fi

if grep -q "MINICLAW_HOME" "$ZSHENV"; then
  ok "MINICLAW_HOME already in $ZSHENV"
else
  echo "export MINICLAW_HOME=\"$MINICLAW_DIR\"" >> "$ZSHENV"
  ok "Added MINICLAW_HOME=$MINICLAW_DIR to $ZSHENV"
fi

# SYSTEM/bin and USER/bin on PATH
if grep -q 'miniclaw/SYSTEM/bin' "$ZSHENV"; then
  ok "SYSTEM/bin already in PATH ($ZSHENV)"
else
  echo "export PATH=\"\$OPENCLAW_STATE_DIR/miniclaw/SYSTEM/bin:\$PATH\"" >> "$ZSHENV"
  ok "Added SYSTEM/bin to PATH in $ZSHENV"
fi

if grep -q 'USER/bin' "$ZSHENV"; then
  ok "USER/bin already in PATH ($ZSHENV)"
else
  echo "export PATH=\"\$OPENCLAW_STATE_DIR/USER/bin:\$PATH\"" >> "$ZSHENV"
  ok "Added USER/bin to PATH in $ZSHENV"
fi

# Interactive-only bits go in .zshrc
for rcfile in "$HOME/.zshrc"; do
  [[ -f "$rcfile" ]] || continue

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
BOARD_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"

# If the board web is already running (port 4220), skip build + reload —
# it's the app the user is using right now (setup wizard lives here too).
BOARD_RUNNING=false
if lsof -ti :4220 &>/dev/null; then
  BOARD_RUNNING=true
  ok "Board web already running on port 4220 — skipping rebuild"
fi

if [[ "$BOARD_RUNNING" == false ]]; then
  if [[ -f "$BOARD_WEB_DIR/package.json" ]]; then
    info "Building board web..."
    (cd "$BOARD_WEB_DIR" && run_quiet npm install --production=false && run_quiet npx next build) \
      && ok "Board web built" \
      || warn "Board web build failed — run: cd $BOARD_WEB_DIR && npm install && npx next build"
  fi
fi

mkdir -p "$HOME/Library/LaunchAgents"
if [[ "$BOARD_RUNNING" == false ]]; then
  launchctl unload "$BOARD_PLIST" 2>/dev/null || true
fi
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
if [[ "$BOARD_RUNNING" == true ]]; then
  ok "Plist written (board web is already live)"
else
  launchctl load "$BOARD_PLIST" 2>/dev/null && ok "Board web LaunchAgent loaded (port 4220)" \
    || warn "LaunchAgent created — run: launchctl load $BOARD_PLIST"
fi

# ── Step 14b: Default board projects ──────────────────────────────────────────
step "Step 14b: Default board projects"

BOARD_DB_DIR="$STATE_DIR/USER/brain"
mkdir -p "$BOARD_DB_DIR"
BOARD_DB="$BOARD_DB_DIR/board.db"

python3 - "$BOARD_DB" << 'PYEOF'
import sqlite3, datetime, sys
db = sys.argv[1]
conn = sqlite3.connect(db)
conn.execute("""CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    work_dir TEXT NOT NULL DEFAULT '', github_repo TEXT NOT NULL DEFAULT '',
    build_command TEXT NOT NULL DEFAULT ''
)""")
now = datetime.datetime.utcnow().isoformat() + "Z"
seeds = [
    ("prj_uncategorized", "Uncategorized", "uncategorized", "Default project for unassigned cards"),
    ("prj_miniclaw_enh", "MiniClaw Enhancements", "miniclaw-enhancements", "Improvements and new features for MiniClaw"),
]
added = 0
for sid, name, slug, desc in seeds:
    if not conn.execute("SELECT id FROM projects WHERE id = ?", (sid,)).fetchone():
        conn.execute("INSERT INTO projects (id, name, slug, description, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (sid, name, slug, desc, "active", now, now))
        added += 1
conn.commit()
conn.close()
print(f"  Seeded {added} project(s)" if added else "  Projects already exist")
PYEOF
ok "Board DB seeded at $BOARD_DB"

# ── Step 15a: Copy scripts ────────────────────────────────────────────────
step "Step 15a: Scripts"

if [[ -d "$REPO_DIR/scripts" ]]; then
  mkdir -p "$MINICLAW_DIR/scripts"
  cp "$REPO_DIR/scripts/relocate-home.sh" "$MINICLAW_DIR/scripts/" 2>/dev/null || true
  chmod +x "$MINICLAW_DIR/scripts/"*.sh 2>/dev/null || true
  ok "Scripts copied to $MINICLAW_DIR/scripts/"
fi

# ── Step 15b: Clean up legacy am-setup LaunchAgent ───────────────────────────
step "Step 15b: Legacy am-setup cleanup"

# Setup wizard is now part of the board web app (port 4220). Remove old 4210 agent.
SETUP_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.am-setup.plist"
if [[ -f "$SETUP_PLIST" ]]; then
  launchctl unload "$SETUP_PLIST" 2>/dev/null || true
  rm -f "$SETUP_PLIST"
  ok "Removed legacy am-setup LaunchAgent (port 4210)"
else
  ok "No legacy am-setup LaunchAgent to remove"
fi

# ── Step 15c: OpenClaw Gateway LaunchAgent ───────────────────────────────────
step "Step 15c: OpenClaw Gateway"

# The gateway is the core process — it runs the telegram bot, cron workers,
# and agent sessions.  `openclaw gateway install` creates a LaunchAgent plist
# and loads it via launchctl.
if command -v openclaw &>/dev/null; then
  GW_PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
  if [[ -f "$GW_PLIST" ]]; then
    info "Gateway LaunchAgent already exists — reinstalling"
  fi
  # openclaw gateway install creates the plist and loads it
  if openclaw gateway install --force 2>/dev/null; then
    ok "OpenClaw Gateway LaunchAgent installed"
    # Give it a moment to start, then verify
    sleep 2
    if openclaw gateway status 2>/dev/null | grep -qi "running\|listening\|connected"; then
      ok "Gateway is running"
    else
      warn "Gateway installed but may not be running yet — check: openclaw gateway status"
    fi
  else
    warn "Gateway install returned non-zero — run: openclaw gateway install --force"
  fi
else
  fail "openclaw not found — cannot install gateway"
fi

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
echo "  MiniClaw: http://localhost:4220"
echo "  Verify:   mc-smoke"
echo ""
echo ""

# Don't open browser — the setup wizard is already running and open
