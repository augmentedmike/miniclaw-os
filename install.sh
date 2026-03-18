#!/usr/bin/env bash
# install.sh — miniclaw-os installer
#
# Installs system dependencies, OpenClaw, and miniclaw plugins + tools.
# Safe to re-run — skips anything already installed.
#
# Usage:
#   ./install.sh                    # interactive (opens browser wizard)
#   ./install.sh --check            # verify only, no changes
#   ./install.sh --config setup.json  # headless install from JSON config

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd 2>/dev/null)" || REPO_DIR="$(pwd)"
STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
MINICLAW_DIR="$STATE_DIR/miniclaw"
PROJECTS_DIR="$STATE_DIR/miniclaw/USER/projects"
LOG_FILE="/tmp/miniclaw-install.log"
ARCH=$(uname -m)

CHECK_ONLY=false
CONFIG_FILE=""
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true
[[ "${1:-}" == "--config" ]] && CONFIG_FILE="${2:-}" && [[ -z "$CONFIG_FILE" ]] && { echo "Usage: install.sh --config <path-to-json>"; exit 1; }

exec > >(tee "$LOG_FILE") 2>&1
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

# Progress helpers: simple line output (no \r overwriting — breaks in log files)
progress() { echo -ne "  ${BLUE}[·]${NC} $1\r"; }
progress_ok()   { echo -e "\r  ${GREEN}[✓]${NC} $1                    "; }
progress_fail() { echo -e "\r  ${RED}[✗]${NC} $1                    "; }
progress_warn() { echo -e "\r  ${YELLOW}[!]${NC} $1                    "; }

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
    NEEDS_MIGRATION=true

    info "Archiving $STATE_DIR -> $ARCHIVE_DIR"
    cp -a "$STATE_DIR" "$ARCHIVE_DIR"
    ok "Archived to $ARCHIVE_DIR"

    catalog_old_install "$ARCHIVE_DIR"
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
for label in com.miniclaw.board-web com.miniclaw.web-chat; do
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

# Remove stale system crontab entries referencing .openclaw or miniclaw
# MiniClaw uses its own cron worker — system crontab entries are leftover from old installs
CRONTAB_HITS=$(crontab -l 2>/dev/null | grep -c 'openclaw\|miniclaw' || true)
if [[ "$CRONTAB_HITS" -gt 0 ]]; then
  info "Removing $CRONTAB_HITS stale crontab entries referencing openclaw/miniclaw"
  crontab -l 2>/dev/null | grep 'openclaw\|miniclaw' | while read -r line; do
    info "  Removing: $line"
  done
  crontab -l 2>/dev/null | grep -v 'openclaw\|miniclaw' | crontab -
  ok "Cleaned $CRONTAB_HITS stale crontab entries"
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

# Read pinned dependency versions from MANIFEST.json
REQUIRED_NODE_MAJOR=$(python3 -c "import json; print(json.load(open('$REPO_DIR/MANIFEST.json'))['dependencies']['node'])" 2>/dev/null || echo "24")
TAILSCALE_VERSION=$(python3 -c "import json; print(json.load(open('$REPO_DIR/MANIFEST.json'))['dependencies']['tailscale']['version'])" 2>/dev/null || echo "1.94.2")
TAILSCALE_PKG_URL=$(python3 -c "import json; print(json.load(open('$REPO_DIR/MANIFEST.json'))['dependencies']['tailscale']['pkg'])" 2>/dev/null || echo "https://pkgs.tailscale.com/stable/Tailscale-${TAILSCALE_VERSION}-macos.pkg")

# Allow .node-version file to override
if [[ -f "$REPO_DIR/.node-version" ]]; then
  REQUIRED_NODE_MAJOR=$(cat "$REPO_DIR/.node-version" | tr -d '[:space:]')
fi

if command -v node &>/dev/null; then
  CURRENT_NODE_MAJOR=$(node --version | tr -d 'v' | cut -d. -f1)
  if [[ "$CURRENT_NODE_MAJOR" -eq "$REQUIRED_NODE_MAJOR" ]]; then
    ok "Node.js $(node --version) (matches required v$REQUIRED_NODE_MAJOR)"
  else
    warn "Node.js $(node --version) found but release requires v$REQUIRED_NODE_MAJOR — installing..."
    run_quiet brew install "node@$REQUIRED_NODE_MAJOR"
    run_quiet brew link --overwrite "node@$REQUIRED_NODE_MAJOR" || true
    NODE_PATH="$BREW_PREFIX/opt/node@$REQUIRED_NODE_MAJOR/bin"
    [[ -d "$NODE_PATH" && ":$PATH:" != *":$NODE_PATH:"* ]] && export PATH="$NODE_PATH:$PATH"
    for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
      grep -q "node@$REQUIRED_NODE_MAJOR" "$p" 2>/dev/null \
        || echo "export PATH=\"$BREW_PREFIX/opt/node@$REQUIRED_NODE_MAJOR/bin:\$PATH\"" >> "$p"
    done
    ok "Node.js $(node --version) installed"
  fi
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "Node.js v$REQUIRED_NODE_MAJOR not found"
else
  info "Installing Node.js $REQUIRED_NODE_MAJOR..."
  run_quiet brew install "node@$REQUIRED_NODE_MAJOR"
  run_quiet brew link --overwrite "node@$REQUIRED_NODE_MAJOR" || true
  NODE_PATH="$BREW_PREFIX/opt/node@$REQUIRED_NODE_MAJOR/bin"
  [[ -d "$NODE_PATH" && ":$PATH:" != *":$NODE_PATH:"* ]] && export PATH="$NODE_PATH:$PATH"
  for p in "$HOME/.zprofile" "$HOME/.zshrc"; do
    grep -q "node@$REQUIRED_NODE_MAJOR" "$p" 2>/dev/null \
      || echo "export PATH=\"$BREW_PREFIX/opt/node@$REQUIRED_NODE_MAJOR/bin:\$PATH\"" >> "$p"
  done
  ok "Node.js $(node --version) installed"
fi

# Pin NODE_BIN for all subsequent operations (rebuilds, plists, etc.)
NODE_BIN="$(which node)"
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_BIN="$NODE_DIR/npm"

# Add npm global bin to PATH now so tools installed with npm -g are immediately usable
NPM_GLOBAL_BIN="$($NPM_BIN config get prefix 2>/dev/null)/bin"
if [[ -d "$NPM_GLOBAL_BIN" && ":$PATH:" != *":$NPM_GLOBAL_BIN:"* ]]; then
  export PATH="$NPM_GLOBAL_BIN:$PATH"
fi

brew_install git
brew_install gh
brew_install python@3 python3
brew_install jq
brew_install age

# Tailscale Mac app (required for remote access, mc-human VNC sessions, and board card links)
# The Mac app provides the menu bar GUI + system extension. The Homebrew formula
# only installs the CLI (`tailscale` + `tailscaled`) with no GUI — not sufficient.
if [[ -d "/Applications/Tailscale.app" ]]; then
  ok "Tailscale.app already installed"
  # Make sure it's running (menu bar app)
  if ! pgrep -f "Tailscale.app" &>/dev/null; then
    open -a Tailscale 2>/dev/null || true
    ok "Tailscale.app launched"
  fi
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "Tailscale.app not found — remote access and mc-human will not work"
else
  info "Installing Tailscale $TAILSCALE_VERSION Mac app (.pkg installer)..."
  TS_PKG="/tmp/tailscale-$$.pkg"
  if curl -fsSL "$TAILSCALE_PKG_URL" -o "$TS_PKG" 2>>"$LOG_FILE"; then
    if sudo -n true 2>/dev/null; then
      sudo installer -pkg "$TS_PKG" -target / >>"$LOG_FILE" 2>&1
    else
      installer -pkg "$TS_PKG" -target CurrentUserHomeDirectory >>"$LOG_FILE" 2>&1 \
        || { info "Tailscale .pkg needs admin — attempting with sudo..."; sudo installer -pkg "$TS_PKG" -target / >>"$LOG_FILE" 2>&1; }
    fi
    rm -f "$TS_PKG"
    open -a Tailscale 2>/dev/null || true
    ok "Tailscale.app installed and launched (menu bar)"
  else
    rm -f "$TS_PKG"
    warn "Tailscale download failed — install from https://pkgs.tailscale.com/stable/#macos"
  fi
fi

# Google Chrome (required for browser automation via remote debugging)
if [[ -d "/Applications/Google Chrome.app" ]]; then
  ok "Google Chrome already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "Google Chrome not found (/Applications/Google Chrome.app)"
else
  info "Installing Google Chrome..."
  run_quiet brew install --cask google-chrome \
    && ok "Google Chrome installed" \
    || warn "Google Chrome install failed — download from https://google.com/chrome"
fi

# Claude Chrome extension — force-install via managed policy
# Extension ID: fcoeoabgfenejglbffodgkkbkcdhcgfn (Anthropic's official "Claude" extension)
CHROME_POLICY_DIR="/Library/Google/Chrome/Managed Preferences"
CHROME_POLICY_FILE="$CHROME_POLICY_DIR/com.google.Chrome.plist"
CLAUDE_EXT_ID="fcoeoabgfenejglbffodgkkbkcdhcgfn"

if [[ -d "/Applications/Google Chrome.app" ]]; then
  # Check if extension is already in the force-install list
  if defaults read "$CHROME_POLICY_FILE" ExtensionInstallForcelist 2>/dev/null | grep -q "$CLAUDE_EXT_ID"; then
    ok "Claude Chrome extension already in force-install policy"
  elif [[ "$CHECK_ONLY" == true ]]; then
    warn "Claude Chrome extension not in force-install policy"
  else
    info "Adding Claude Chrome extension to force-install policy..."
    if sudo -n true 2>/dev/null; then
      sudo mkdir -p "$CHROME_POLICY_DIR"
      EXISTING=$(defaults read "$CHROME_POLICY_FILE" ExtensionInstallForcelist 2>/dev/null | grep -o '"[^"]*"' | tr -d '"' || true)
      ENTRIES=()
      if [[ -n "$EXISTING" ]]; then
        while IFS= read -r entry; do
          [[ -n "$entry" ]] && ENTRIES+=("$entry")
        done <<< "$EXISTING"
      fi
      ENTRIES+=("${CLAUDE_EXT_ID};https://clients2.google.com/service/update2/crx")
      sudo defaults write "$CHROME_POLICY_FILE" ExtensionInstallForcelist -array "${ENTRIES[@]}"
      ok "Claude Chrome extension added to force-install policy (installs on next Chrome launch)"
    else
      warn "Claude Chrome extension skipped (no sudo — install manually from Chrome Web Store)"
    fi
  fi
fi

# mc-chrome launcher (starts Chrome with remote debugging on port 9222)
MC_CHROME="$REPO_DIR/SYSTEM/bin/mc-chrome"
if [[ -x "$MC_CHROME" ]]; then
  ok "mc-chrome launcher present"
else
  fail "mc-chrome launcher missing — expected at $MC_CHROME"
fi

# ── Step 2a: whisper.cpp + sox (mc-voice / transcribe) ───────────────────────
step "Step 2a: whisper.cpp (local speech-to-text)"

brew_install sox sox

WHISPER_MODELS_DIR="$MINICLAW_DIR/SYSTEM/whisper-models"
mkdir -p "$WHISPER_MODELS_DIR"

brew_install whisper-cpp whisper-cpp

# Download default base.en model (~142MB)
BASE_MODEL="$WHISPER_MODELS_DIR/ggml-base.en.bin"
if [[ -f "$BASE_MODEL" ]]; then
  ok "whisper base.en model present"
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "whisper base.en model not found"
else
  info "Downloading whisper base.en model (~142MB)..."
  if curl -fsSL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" -o "$BASE_MODEL.tmp" 2>>"$LOG_FILE"; then
    mv "$BASE_MODEL.tmp" "$BASE_MODEL"
    ok "whisper base.en model downloaded"
  else
    rm -f "$BASE_MODEL.tmp"
    warn "Model download failed — run: mc mc-voice download-model"
  fi
fi

# ── Step 2b: Power management (macOS) ────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  step "Step 2b: Power management (always-on)"

  if [[ "$CHECK_ONLY" == true ]]; then
    DISK_SLEEP=$(pmset -g 2>/dev/null | grep disksleep | awk '{print $2}')
    AUTO_RESTART=$(pmset -g 2>/dev/null | grep autorestart | awk '{print $2}')
    [[ "$DISK_SLEEP" == "0" ]] && ok "disksleep = 0" || warn "disksleep = ${DISK_SLEEP:-unknown}" "should be 0"
    [[ "$AUTO_RESTART" == "1" ]] && ok "autorestart = 1" || warn "autorestart = ${AUTO_RESTART:-unknown}" "should be 1"
  else
    sudo pmset -a disksleep 0 2>/dev/null && ok "disksleep set to 0 (disk sleep disabled)" || warn "failed to set disksleep"
    sudo pmset -a autorestart 1 2>/dev/null && ok "autorestart set to 1 (auto restart after power failure)" || warn "failed to set autorestart"
  fi
fi

# ── Step 3: Claude Code ──────────────────────────────────────────────────────
step "Step 3: Claude Code"

if command -v claude &>/dev/null; then
  ok "Claude Code already installed ($(claude --version 2>/dev/null | head -1))"
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "Claude Code not found"
else
  info "Installing Claude Code..."
  run_quiet npm install -g @anthropic-ai/claude-code \
    && ok "Claude Code installed" \
    || die "Claude Code install failed — run: npm install -g @anthropic-ai/claude-code"
fi

# ── Step 4: QMD (optional) ────────────────────────────────────────────────────
step "Step 4: QMD"

if command -v qmd &>/dev/null; then
  ok "QMD already installed"
elif [[ "$CHECK_ONLY" == true ]]; then
  warn "QMD not found"
else
  run_quiet npm install -g qmd && ok "QMD installed" \
    || warn "QMD install failed — run: npm install -g qmd"
fi

# ── Step 5: OpenClaw (from MiniClaw fork) ─────────────────────────────────────
step "Step 5: OpenClaw"

# Read pinned openclaw version from MANIFEST.json
OPENCLAW_NPM_PKG=$(python3 -c "
import json
m = json.load(open('$REPO_DIR/MANIFEST.json'))
print(m.get('openclaw', {}).get('npm', '@miniclaw_official/openclaw'))
" 2>/dev/null || echo "@miniclaw_official/openclaw")
OPENCLAW_NPM_VER=$(python3 -c "
import json
m = json.load(open('$REPO_DIR/MANIFEST.json'))
print(m.get('openclaw', {}).get('npmVersion', ''))
" 2>/dev/null || echo "")
OPENCLAW_INSTALL_SPEC="$OPENCLAW_NPM_PKG"
[[ -n "$OPENCLAW_NPM_VER" ]] && OPENCLAW_INSTALL_SPEC="$OPENCLAW_NPM_PKG@$OPENCLAW_NPM_VER"

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
  INSTALLED_PKG=$(npm list -g 2>/dev/null | grep -o '@miniclaw_official/openclaw@[^ ]*' || true)
  if [[ -n "$INSTALLED_PKG" ]]; then
    INSTALLED_VER=$(echo "$INSTALLED_PKG" | sed 's/.*@//')
    # Check if installed version has the root-alias fix (>= 2026.3.9)
    if [[ "$INSTALLED_VER" == *"-mc."* || "$INSTALLED_VER" < "2026.3.9" ]]; then
      info "Updating OpenClaw fork from $INSTALLED_VER to $OPENCLAW_NPM_VER..."
      run_quiet npm install -g "$OPENCLAW_INSTALL_SPEC" && ok "Updated to $(openclaw --version 2>/dev/null | head -1)" \
        || warn "Update failed — run: npm install -g $OPENCLAW_INSTALL_SPEC"
    fi
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
    info "Installing OpenClaw from $OPENCLAW_INSTALL_SPEC..."
    run_quiet npm install -g "$OPENCLAW_INSTALL_SPEC" || die "OpenClaw install failed"
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
  "agents": { "defaults": { "model": { "primary": "anthropic/claude-sonnet-4-6" }, "compaction": { "mode": "safeguard" } } },
  "plugins": {},
  "gateway": { "mode": "local" }
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

# ── Step 6: Directories ───────────────────────────────────────────────────────
step "Step 6: Directories"

mkdir -p "$MINICLAW_DIR/plugins" "$PROJECTS_DIR"
ln -sfn "$PROJECTS_DIR" "$HOME/mc-projects"
ok "~/.openclaw/miniclaw/"
ok "~/.openclaw/miniclaw/USER/projects/"
ok "~/mc-projects symlink"

# Copy MANIFEST.json so the CLI can read the MiniClaw version at runtime
if [[ -f "$REPO_DIR/MANIFEST.json" ]]; then
  cp "$REPO_DIR/MANIFEST.json" "$MINICLAW_DIR/MANIFEST.json"
  ok "MANIFEST.json (v$(python3 -c "import json; print(json.load(open('$MINICLAW_DIR/MANIFEST.json')).get('version','?'))"))"
fi

# ── Step 7: Install plugins ───────────────────────────────────────────────────
step "Step 7: miniclaw plugins"

# Migrated plugins: install to $MINICLAW_DIR/<name>/ (standalone CLI)
MIGRATED_PLUGINS=(vault designer)

for migrated in "${MIGRATED_PLUGINS[@]}"; do
  src="$REPO_DIR/$migrated"
  dest="$MINICLAW_DIR/$migrated"
  if [[ ! -d "$src" ]]; then
    warn "Source not found: $src"
    continue
  fi
  rsync -a --exclude='node_modules' --exclude='.git' "$src/" "$dest/"
  [[ -f "$dest/cli" ]] && chmod +x "$dest/cli"
  [[ -f "$dest/cli.ts" ]] && chmod +x "$dest/cli.ts"
  ok "Copied $migrated"
done

# Copy plugins to $MINICLAW_DIR/plugins/
PLUGIN_COUNT=0
for plugin_src in "$REPO_DIR/plugins"/*/; do
  plugin_name="$(basename "$plugin_src")"
  plugin_dest="$MINICLAW_DIR/plugins/$plugin_name"
  rsync -a --exclude='node_modules' --exclude='.git' "$plugin_src" "$plugin_dest/"
  PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
done
ok "$PLUGIN_COUNT plugins copied"

# Install deps for mc-board in miniclaw/plugins/ — the agent-runner runs from
# this directory and needs better-sqlite3 native bindings for the host Node.
BOARD_PLUGIN_DIR="$MINICLAW_DIR/plugins/mc-board"
if [[ -f "$BOARD_PLUGIN_DIR/package.json" ]]; then
  info "Installing mc-board deps (agent-runner needs native better-sqlite3)..."
  if (cd "$BOARD_PLUGIN_DIR" && PATH="$NODE_DIR:$PATH" "$NPM_BIN" install --omit=dev >>"$LOG_FILE" 2>&1); then
    if (cd "$BOARD_PLUGIN_DIR" && PATH="$NODE_DIR:$PATH" "$NPM_BIN" rebuild better-sqlite3 >>"$LOG_FILE" 2>&1); then
      ok "mc-board deps installed + better-sqlite3 rebuilt"
    else
      warn "mc-board npm install ok but better-sqlite3 rebuild failed"
    fi
  else
    warn "mc-board npm install failed — agent-runner may crash-loop"
  fi
fi

# ── Step 8: Install plugins to extensions + patch openclaw.json ──────────────
step "Step 8: Plugin registration"

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

# Install plugins directly to extensions/ — no `openclaw plugins install` needed.
# If bootstrap staged pre-built plugins (with node_modules), use those.
# Otherwise fall back to copying from miniclaw/plugins/ and running npm install.
PREBUILT_DIR="$STATE_DIR/.plugins-prebuilt"
EXTENSIONS_DIR="$STATE_DIR/extensions"
PLUGINS_DIR="$MINICLAW_DIR/plugins"
mkdir -p "$EXTENSIONS_DIR"

# If pre-built plugins exist, install shared node_modules at extensions root
if [[ -d "$PREBUILT_DIR/node_modules" ]]; then
  info "Installing shared dependencies (pre-built)..."
  rsync -a "$PREBUILT_DIR/node_modules/" "$EXTENSIONS_DIR/node_modules/"
  [[ -f "$PREBUILT_DIR/package.json" ]] && cp "$PREBUILT_DIR/package.json" "$EXTENSIONS_DIR/package.json"
  ok "Shared node_modules installed"
fi

REGISTERED=0
for plugin_dir in "$PLUGINS_DIR"/mc-*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name="$(basename "$plugin_dir")"
  [[ "$plugin_name" == "shared" ]] && continue
  [[ ! -f "$plugin_dir/openclaw.plugin.json" ]] && { warn "$plugin_name missing manifest — skipped"; continue; }

  ext_dest="$EXTENSIONS_DIR/$plugin_name"

  if [[ -d "$PREBUILT_DIR/$plugin_name" ]]; then
    # Use pre-built plugin source (deps are in shared node_modules above)
    rsync -a "$PREBUILT_DIR/$plugin_name/" "$ext_dest/"
    # Also copy anything from source that prebuilt excluded (e.g. web/ for mc-board)
    rsync -a --ignore-existing "$plugin_dir/" "$ext_dest/"
  else
    # Fallback: copy source and install deps per-plugin
    rsync -a --exclude='node_modules' --exclude='.git' "$plugin_dir/" "$ext_dest/"
    if [[ -f "$ext_dest/package.json" ]]; then
      dep_count=$(python3 -c "import json; print(len(json.load(open('$ext_dest/package.json')).get('dependencies',{})))" 2>/dev/null || echo "0")
      if [[ "$dep_count" -gt 0 ]]; then
        (cd "$ext_dest" && npm install --omit=dev >>"$LOG_FILE" 2>&1) || warn "npm install failed for $plugin_name"
      fi
    fi
  fi

  ok "Installed $plugin_name"
  REGISTERED=$((REGISTERED + 1))
done

# Rebuild ALL better-sqlite3 native modules for the pinned Node version.
info "Rebuilding native modules for Node $("$NODE_BIN" --version) (ABI $("$NODE_BIN" -e 'console.log(process.versions.modules)'))..."
REBUILD_COUNT=0
while IFS= read -r -d '' bs3_pkg; do
  bs3_dir="$(dirname "$bs3_pkg")"
  parent="$(dirname "$(dirname "$bs3_dir")")"
  rm -rf "$bs3_dir/build" 2>/dev/null
  if (cd "$parent" && PATH="$NODE_DIR:$PATH" "$NPM_BIN" rebuild better-sqlite3 2>>"$LOG_FILE"); then
    REBUILD_COUNT=$((REBUILD_COUNT + 1))
  else
    warn "better-sqlite3 rebuild failed in $parent"
  fi
done < <(find "$EXTENSIONS_DIR" "$MINICLAW_DIR/plugins" -path "*/node_modules/better-sqlite3/package.json" -print0 2>/dev/null)
if [[ $REBUILD_COUNT -gt 0 ]]; then
  ok "Rebuilt better-sqlite3 in $REBUILD_COUNT locations"
else
  warn "No better-sqlite3 found to rebuild"
fi

# Clean up pre-built staging
rm -rf "$PREBUILT_DIR"

# Write all plugin entries to openclaw.json in one shot
python3 - "$STATE_DIR/openclaw.json" "$EXTENSIONS_DIR" <<'REGEOF'
import json, sys, os, glob
from datetime import datetime, timezone

config_path = sys.argv[1]
extensions_dir = sys.argv[2]

with open(config_path) as f:
    cfg = json.load(f)

plugins = cfg.setdefault("plugins", {})
entries = plugins.setdefault("entries", {})
installs = plugins.setdefault("installs", {})

now = datetime.now(timezone.utc).isoformat()

for manifest_path in sorted(glob.glob(os.path.join(extensions_dir, "mc-*", "openclaw.plugin.json"))):
    plugin_dir = os.path.dirname(manifest_path)
    plugin_name = os.path.basename(plugin_dir)
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
        plugin_id = manifest.get("id", plugin_name)
        version = manifest.get("version", "0.1.0")
    except (json.JSONDecodeError, KeyError):
        continue

    entries[plugin_id] = {"enabled": True}
    installs[plugin_id] = {
        "source": "path",
        "sourcePath": plugin_dir,
        "installPath": plugin_dir,
        "version": version,
        "installedAt": now
    }

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

print(f"  Registered {len([k for k in entries if k.startswith('mc-')])} plugins in openclaw.json")
REGEOF

ok "Registered $REGISTERED plugins (direct install, no openclaw CLI)"

# ── Step 9: CLI tools → SYSTEM/bin ────────────────────────────────────────────
step "Step 9: CLI tools"

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

# ── Step 10: Directories ───────────────────────────────────────────────────────
step "Step 10: User directories"

USER_MEMORY_DIR="$STATE_DIR/USER/memory"
SOUL_BACKUPS_DIR="$STATE_DIR/soul-backups"

mkdir -p "$USER_MEMORY_DIR"
ok "~/.openclaw/USER/memory/"

mkdir -p "$STATE_DIR/USER/brain"
ok "~/.openclaw/USER/brain/"

mkdir -p "$SOUL_BACKUPS_DIR"
ok "~/.openclaw/soul-backups/"

# ── Step 11: QMD collections ──────────────────────────────────────────────────
step "Step 11: QMD collections"

if command -v qmd &>/dev/null; then

  if qmd collection list 2>/dev/null | grep -q "mc-memory"; then
    ok "mc-memory collection already registered"
  else
    qmd collection add mc-memory "$USER_MEMORY_DIR" 2>/dev/null \
      && ok "mc-memory collection registered → $USER_MEMORY_DIR" \
      || warn "mc-memory registration failed — run: qmd collection add mc-memory $USER_MEMORY_DIR"
  fi
else
  warn "qmd not found — skipping collection setup"
fi

# ── Step 12: Vault ────────────────────────────────────────────────────────────
step "Step 12: Vault"

VAULT_ROOT="$MINICLAW_DIR/SYSTEM/vault"
MC_VAULT="$MINICLAW_DIR/vault/cli"

if [[ ! -f "$VAULT_ROOT/key.txt" ]]; then
  OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" init
  ok "Vault initialised"
else
  ok "Vault already initialised"
fi

# All secrets (gh-token, email-app-password, gemini-api-key) are collected
# in the board web setup wizard (port 4220) — not in the terminal installer.


# -- Step 16: Migrate data from archived OpenClaw install ------------------
if [[ "$NEEDS_MIGRATION" == true ]]; then
  step "Step 16: Migrating your OpenClaw data"

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
      # Skip node_modules and other non-plugin directories
      [[ "$plugin_name" == "node_modules" || "$plugin_name" == ".git" ]] && continue
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


# ── Step 13: Cron workers (from MANIFEST.json) ───────────────────────────────
step "Step 13: Cron workers"

# Write cron jobs directly to jobs.json so OpenClaw picks them up on startup.
# Reads expected crons from MANIFEST.json — no running gateway required.
CRON_DIR="$STATE_DIR/cron"
CRON_FILE="$CRON_DIR/jobs.json"
mkdir -p "$CRON_DIR"

# Merge cron jobs from MANIFEST into jobs.json (preserves any existing jobs)
python3 << PYEOF
import json, uuid, os, sys, subprocess

cron_file = "$CRON_FILE"
vault_bin = "$MC_VAULT"
vault_root = "$VAULT_ROOT"

# Load existing
store = {"version": 1, "jobs": []}
try:
    with open(cron_file) as f:
        store = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    pass

existing_names = {j.get("name") for j in store.get("jobs", [])}

def vault_has(key):
    """Check if a vault secret exists."""
    try:
        env = dict(os.environ, OPENCLAW_VAULT_ROOT=vault_root)
        r = subprocess.run([vault_bin, "get", key], capture_output=True, text=True, env=env)
        return r.returncode == 0 and r.stdout.strip() != ""
    except Exception:
        return False

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
    # Check if this cron requires vault secrets
    requires = mc.get("requires", [])
    has_deps = all(vault_has(k) for k in requires) if requires else True
    is_optional = mc.get("optional", False)

    # Skip optional crons whose dependencies are missing
    if is_optional and not has_deps:
        print(f"  Skipping {mc['name']} (missing: {', '.join(requires)})")
        continue

    w = {
        "name": mc["name"],
        "agentId": "cron",
        "schedule": mc["schedule"],
        "sessionTarget": mc.get("sessionTarget", "isolated"),
        "model": mc.get("model", "claude-haiku-4-5-20251001"),
        "payload": {
            "kind": "agentTurn",
            "timeoutSeconds": mc.get("timeoutSeconds", 600),
            "messageFile": f"prompts/{mc['name']}.md"
        },
        "delivery": {"mode": "none"},
        "enabled": has_deps
    }
    workers.append(w)

# Fallback if MANIFEST had no crons
if not workers:
    workers = [
        {
            "name": "board-worker-backlog",
            "agentId": "cron",
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
            "agentId": "cron",
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
            "agentId": "cron",
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
    print(f"  Added {added} cron worker(s) to jobs.json")
else:
    print("  All cron workers already in jobs.json")
PYEOF
ok "Cron workers written to $CRON_FILE"

# Copy cron prompts
if [[ -d "$REPO_DIR/cron/prompts" ]]; then
  mkdir -p "$CRON_DIR/prompts"
  cp -r "$REPO_DIR/cron/prompts/"* "$CRON_DIR/prompts/" 2>/dev/null || true
  ok "Cron prompts copied"
fi

# ── Step 14: Shell env ────────────────────────────────────────────────────────
step "Step 14: Shell environment"

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

# npm global bin on PATH (for claude, openclaw, qmd, etc.)
NPM_GLOBAL_BIN="$(npm config get prefix 2>/dev/null)/bin"
if [[ -d "$NPM_GLOBAL_BIN" ]]; then
  if grep -q "$NPM_GLOBAL_BIN" "$ZSHENV" 2>/dev/null; then
    ok "npm global bin already in PATH ($ZSHENV)"
  else
    echo "export PATH=\"$NPM_GLOBAL_BIN:\$PATH\"" >> "$ZSHENV"
    ok "Added $NPM_GLOBAL_BIN to PATH in $ZSHENV"
  fi
fi

# Node.js bin on PATH
if [[ -n "${NODE_DIR:-}" && -d "$NODE_DIR" ]]; then
  if grep -q "$NODE_DIR" "$ZSHENV" 2>/dev/null; then
    ok "Node bin already in PATH ($ZSHENV)"
  else
    echo "export PATH=\"$NODE_DIR:\$PATH\"" >> "$ZSHENV"
    ok "Added $NODE_DIR to PATH in $ZSHENV"
  fi
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

# Aliases in .zshenv so agents and non-interactive shells get them too
if grep -q "alias oc=" "$ZSHENV"; then
  ok "oc alias already in $ZSHENV"
else
  echo "alias oc='openclaw'" >> "$ZSHENV"
  ok "Added oc alias to $ZSHENV"
fi

CLAUDE_BIN="$(which claude 2>/dev/null || echo "")"
if [[ -n "$CLAUDE_BIN" ]]; then
  if grep -q "alias claude=" "$ZSHENV"; then
    ok "claude alias already in $ZSHENV"
  else
    echo "alias claude='claude --dangerously-skip-permissions --chrome'" >> "$ZSHENV"
    ok "Added claude alias to $ZSHENV"
  fi
fi

# ── Step 15: Board web build + LaunchAgent ────────────────────────────────────
step "Step 15: Board web server"

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
    if (cd "$BOARD_WEB_DIR" && run_quiet npm install --production=false && run_quiet npx next build); then
      # Copy static assets into standalone dir (Next.js doesn't do this automatically)
      cp -r "$BOARD_WEB_DIR/.next/static" "$BOARD_WEB_DIR/.next/standalone/.next/static" 2>/dev/null
      cp -r "$BOARD_WEB_DIR/public" "$BOARD_WEB_DIR/.next/standalone/public" 2>/dev/null
      ok "Board web built (standalone + static assets)"
    else
      warn "Board web build failed — run: cd $BOARD_WEB_DIR && npm install && npx next build"
    fi
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
    <string>$NODE_BIN</string>
    <string>$BOARD_WEB_DIR/.next/standalone/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$BOARD_WEB_DIR/.next/standalone</string>
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
    <string>4220</string>
    <key>HOSTNAME</key>
    <string>0.0.0.0</string>
    <key>PATH</key>
    <string>$HOME/.local/bin:$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
    <key>NODE_ENV</key>
    <string>production</string>
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

# ── Step 15b: mc-web-chat WebSocket server ─────────────────────────────────────
step "Step 15b: Web chat server"

CHAT_DIR="$MINICLAW_DIR/plugins/mc-web-chat"
CHAT_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.web-chat.plist"
CHAT_EXT_DIR="$STATE_DIR/extensions/mc-web-chat"

if [[ -f "$CHAT_DIR/server.ts" ]]; then
  # Copy to extensions
  mkdir -p "$CHAT_EXT_DIR"
  cp "$CHAT_DIR/server.ts" "$CHAT_DIR/run.ts" "$CHAT_DIR/package.json" "$CHAT_DIR/openclaw.plugin.json" "$CHAT_EXT_DIR/" 2>/dev/null
  (cd "$CHAT_EXT_DIR" && run_quiet npm install --production 2>/dev/null) || true

  launchctl unload "$CHAT_PLIST" 2>/dev/null || true
  cat > "$CHAT_PLIST" << CHATPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.web-chat</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--import</string>
    <string>tsx</string>
    <string>$CHAT_EXT_DIR/run.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$CHAT_EXT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/logs/mc-web-chat.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/mc-web-chat.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>$HOME/.local/bin:$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
  </dict>
</dict>
</plist>
CHATPLIST
  mkdir -p "$STATE_DIR/logs"
  launchctl load "$CHAT_PLIST" 2>/dev/null && ok "Web chat LaunchAgent loaded (port 4221)" \
    || warn "LaunchAgent created — run: launchctl load $CHAT_PLIST"
else
  info "mc-web-chat plugin not found — skipping"
fi

# ── Step 14a2: Agent runner LaunchAgent ────────────────────────────────────────
step "Step 14a2: Agent runner daemon"

RUNNER_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-agent-runner.plist"
RUNNER_SCRIPT="$MINICLAW_DIR/plugins/mc-board/agent-runner/runner.mjs"

if [[ -f "$RUNNER_SCRIPT" ]]; then
  cat > "$RUNNER_PLIST" << RUNNERPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.board-agent-runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$RUNNER_SCRIPT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>$HOME/.local/bin:$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_PATH</key>
    <string>$MINICLAW_DIR/plugins/mc-board/node_modules:$STATE_DIR/extensions/node_modules:$STATE_DIR/extensions/mc-board/node_modules</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
    <key>OPENCLAW_BIN</key>
    <string>$(which openclaw || echo /opt/homebrew/bin/openclaw)</string>
    <key>CLAUDE_BIN</key>
    <string>$(which claude || echo $HOME/.local/bin/claude)</string>
    <key>BOARD_DB_PATH</key>
    <string>$STATE_DIR/USER/brain/board.db</string>
    <key>AGENT_RUNNER_POLL_MS</key>
    <string>5000</string>
    <key>AGENT_RUNNER_MAX_CONCURRENT</key>
    <string>3</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/logs/agent-runner.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/agent-runner.stderr.log</string>
  <key>WorkingDirectory</key>
  <string>$(dirname "$RUNNER_SCRIPT")</string>
</dict>
</plist>
RUNNERPLIST

  launchctl unload "$RUNNER_PLIST" 2>/dev/null || true
  launchctl load "$RUNNER_PLIST" 2>/dev/null && ok "Agent runner LaunchAgent loaded" \
    || warn "Agent runner plist created — run: launchctl load $RUNNER_PLIST"
else
  warn "Agent runner script not found at $RUNNER_SCRIPT — skipping"
fi

# ── Step 14a3: Auto-update LaunchAgent ────────────────────────────────────────
step "Step 14a3: Auto-update"

UPDATE_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.auto-update.plist"
UPDATE_BIN="$MINICLAW_DIR/SYSTEM/bin/mc-update"

if [[ -x "$UPDATE_BIN" ]]; then
  cat > "$UPDATE_PLIST" << UPDATEPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miniclaw.auto-update</string>
  <key>ProgramArguments</key>
  <array>
    <string>$UPDATE_BIN</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>$HOME/.local/bin:$NODE_DIR:$MINICLAW_DIR/SYSTEM/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OPENCLAW_STATE_DIR</key>
    <string>$STATE_DIR</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/logs/mc-update.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/logs/mc-update.log</string>
</dict>
</plist>
UPDATEPLIST

  launchctl unload "$UPDATE_PLIST" 2>/dev/null || true
  launchctl load "$UPDATE_PLIST" 2>/dev/null && ok "Auto-update enabled (daily at 4am)" \
    || warn "Auto-update plist created — run: launchctl load $UPDATE_PLIST"
else
  warn "mc-update not found — skipping auto-update setup"
fi

# ── Step 14b: Default board projects ──────────────────────────────────────────
step "Step 14b: Default board projects"

BOARD_DB_DIR="$STATE_DIR/USER/brain"
mkdir -p "$BOARD_DB_DIR"
BOARD_DB="$BOARD_DB_DIR/board.db"

# Load schema and seed data from single-source-of-truth SQL files
SCHEMA_SQL="$REPO_DIR/plugins/mc-board/schema.sql"
SEED_SQL="$REPO_DIR/plugins/mc-board/seed.sql"

if [[ -f "$SCHEMA_SQL" ]]; then
  sqlite3 "$BOARD_DB" < "$SCHEMA_SQL"
  ok "Schema loaded from plugins/mc-board/schema.sql"
else
  warn "schema.sql not found — board DB may be incomplete"
fi

if [[ -f "$SEED_SQL" ]]; then
  sqlite3 "$BOARD_DB" < "$SEED_SQL"
  CARD_COUNT=$(sqlite3 "$BOARD_DB" "SELECT COUNT(*) FROM cards;")
  PROJ_COUNT=$(sqlite3 "$BOARD_DB" "SELECT COUNT(*) FROM projects;")
  ok "Seeded $PROJ_COUNT project(s), $CARD_COUNT card(s)"
else
  warn "seed.sql not found — no starter data"
fi

# Seed board cron config — separate from gateway's cron/jobs.json so it doesn't get overwritten
BOARD_CRON="$BOARD_DB_DIR/board-cron.json"
if [[ ! -f "$BOARD_CRON" ]]; then
  cat > "$BOARD_CRON" << 'CRONSEED'
{
  "board-backlog-triage": { "name": "Backlog Triage", "schedule": "*/5 * * * *", "enabled": true, "maxConcurrent": 3 },
  "board-in-progress-triage": { "name": "In Progress Triage", "schedule": "*/5 * * * *", "enabled": true, "maxConcurrent": 3 },
  "board-in-review-triage": { "name": "In Review Triage", "schedule": "*/5 * * * *", "enabled": true, "maxConcurrent": 3 }
}
CRONSEED
  ok "Board cron config seeded"
else
  ok "Board cron config already exists"
fi

# Copy default triage/work prompts to USER brain (editable by user/agent)
PROMPTS_DEFAULTS="$REPO_DIR/plugins/mc-board/prompts/defaults"
PROMPTS_USER="$STATE_DIR/USER/brain/prompts"
if [[ -d "$PROMPTS_DEFAULTS" ]]; then
  mkdir -p "$PROMPTS_USER"
  PROMPT_COUNT=0
  for pf in "$PROMPTS_DEFAULTS"/*.txt; do
    [[ -f "$pf" ]] || continue
    dest="$PROMPTS_USER/$(basename "$pf")"
    # Don't overwrite user-customized prompts
    if [[ ! -f "$dest" ]]; then
      cp "$pf" "$dest"
      PROMPT_COUNT=$((PROMPT_COUNT + 1))
    fi
  done
  ok "Installed $PROMPT_COUNT default prompt(s) to USER/brain/prompts/"
fi

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
GW_LABELS=("Configuring Telegram" "Connecting to gateway" "Hacking the matrix" "Coming online")
step "Step 15c: ${GW_LABELS[$((RANDOM % ${#GW_LABELS[@]}))]}"

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

# ── Step 15d: Sync Claude Code credentials to gateway ────────────────────────
step "Step 15d: Claude auth"

# OpenClaw gateway needs auth-profiles.json to call the Anthropic API.
# If the user is logged into Claude Code, their OAuth token is in the macOS
# Keychain under "Claude Code-credentials". Sync it to the gateway's agent dir.
AGENT_DIR="$STATE_DIR/agents/main/agent"
AUTH_PROFILES="$AGENT_DIR/auth-profiles.json"

if [[ ! -f "$AUTH_PROFILES" ]]; then
  # Try reading from macOS Keychain (Claude Code stores creds there)
  KEYCHAIN_CREDS=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
  if [[ -n "$KEYCHAIN_CREDS" ]]; then
    mkdir -p "$AGENT_DIR"
    echo "$KEYCHAIN_CREDS" | python3 -c "
import json, sys, os
raw = sys.stdin.read().strip()
creds = json.loads(raw)
oauth = creds.get('claudeAiOauth', {})
if not oauth.get('accessToken'):
    print('  No OAuth token found in keychain')
    sys.exit(0)
store = {
    'version': 1,
    'profiles': {
        'claude-cli': {
            'type': 'oauth',
            'provider': 'anthropic',
            'access': oauth['accessToken'],
            'refresh': oauth.get('refreshToken', ''),
            'expires': oauth.get('expiresAt', 0),
        }
    }
}
with open('$AUTH_PROFILES', 'w') as f:
    json.dump(store, f, indent=2)
print('  Synced from Claude Code keychain')
" && ok "Claude credentials synced from Keychain" \
    || warn "Could not parse Claude Code credentials"
  else
    warn "No Claude Code credentials in Keychain — run: openclaw login (or log into Claude Code first)"
  fi
else
  ok "auth-profiles.json already exists"
fi

# ── Step 15d2: Tailscale login ───────────────────────────────────────────────
step "Step 15d2: Tailscale remote access"

# Tailscale enables: mc-human VNC sessions, board card deep links from phone,
# and remote access to the agent from outside the local network.
TAILSCALE_BIN="$(command -v tailscale 2>/dev/null || echo '')"
TAILSCALE_APP="/Applications/Tailscale.app"

if [[ -d "$TAILSCALE_APP" ]]; then
  # Open the Tailscale app so the daemon starts
  open -a Tailscale 2>/dev/null || true
  sleep 2
  # Check if already logged in
  if "$TAILSCALE_BIN" status 2>/dev/null | grep -q "Logged in"; then
    ok "Tailscale is connected"
  else
    info "Starting Tailscale..."
    # Start the daemon
    if [[ -d "/Applications/Tailscale.app" ]]; then
      open -a Tailscale 2>/dev/null || true
      sleep 2
    fi
    # Bring the interface up (may prompt for browser login)
    sudo tailscale up 2>>"$LOG_FILE" || true
    sleep 3
    # Check connection and get IP
    TS_IP=$("$TAILSCALE_BIN" ip -4 2>/dev/null || echo "")
    if [[ -n "$TS_IP" ]]; then
      ok "Tailscale connected ($TS_IP)"
      # Save the Tailscale IP — store under 'miniclaw' key (not 'gateway' which has strict schema)
      python3 -c "
import json
p = '$STATE_DIR/openclaw.json'
with open(p) as f: cfg = json.load(f)
mc = cfg.setdefault('miniclaw', {})
mc['externalUrl'] = 'http://$TS_IP:4220'
with open(p, 'w') as f: json.dump(cfg, f, indent=2); f.write('\n')
" 2>/dev/null && ok "miniclaw.externalUrl set to http://$TS_IP:4220"
    else
      warn "Tailscale not yet connected — run 'sudo tailscale up' after install"
    fi
  fi
elif [[ -n "$TAILSCALE_BIN" ]]; then
  warn "Tailscale CLI found but Tailscale.app not installed — install from https://tailscale.com/download/mac for full functionality"
else
  warn "Tailscale not installed — install from https://tailscale.com/download/mac (needed for remote access and mc-human)"
fi

# ── Headless: write setup-state.json early so personalization can use it ──────
SETUP_STATE="$STATE_DIR/USER/setup-state.json"
if [[ -n "$CONFIG_FILE" && -f "$CONFIG_FILE" && ! -f "$SETUP_STATE" ]]; then
  mkdir -p "$(dirname "$SETUP_STATE")"
  cp "$CONFIG_FILE" "$SETUP_STATE"
  ok "Setup state written from config (headless)"
fi

# ── Step 15e: Personalize workspace from setup wizard ────────────────────────
step "Step 15e: Agent identity"

WORKSPACE_DIR="$STATE_DIR/workspace"

# Copy MiniClaw workspace templates (root + refs/) if they exist in the repo.
# Prefer staged templates from the installer bundle (available offline/early),
# fall back to the cloned repo's workspace/ directory.
MC_WORKSPACE_TEMPLATES="$REPO_DIR/workspace"
if [[ -d "${STATE_DIR}/.workspace-templates" ]]; then
  MC_WORKSPACE_TEMPLATES="${STATE_DIR}/.workspace-templates"
fi
if [[ -d "$MC_WORKSPACE_TEMPLATES" ]]; then
  mkdir -p "$WORKSPACE_DIR" "$WORKSPACE_DIR/refs" "$WORKSPACE_DIR/memory"
  # Root files (always-loaded by the gateway)
  for tpl in "$MC_WORKSPACE_TEMPLATES"/*.md; do
    [[ -f "$tpl" ]] || continue
    dest="$WORKSPACE_DIR/$(basename "$tpl")"
    [[ ! -f "$dest" ]] && cp "$tpl" "$dest"
  done
  # Reference files (loaded on demand)
  if [[ -d "$MC_WORKSPACE_TEMPLATES/refs" ]]; then
    for tpl in "$MC_WORKSPACE_TEMPLATES/refs"/*.md; do
      [[ -f "$tpl" ]] || continue
      dest="$WORKSPACE_DIR/refs/$(basename "$tpl")"
      [[ ! -f "$dest" ]] && cp "$tpl" "$dest"
    done
  fi
  ok "Workspace templates installed ($(ls "$WORKSPACE_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ') root + $(ls "$WORKSPACE_DIR/refs/"*.md 2>/dev/null | wc -l | tr -d ' ') refs)"
fi

if [[ -f "$SETUP_STATE" && -d "$WORKSPACE_DIR" ]]; then
  python3 - "$SETUP_STATE" "$WORKSPACE_DIR" "$MINICLAW_DIR/MANIFEST.json" <<'PERSONALIZE_PYEOF'
import json, sys, os
from datetime import date

state_path, workspace, manifest_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(state_path) as f:
    state = json.load(f)

name = state.get("assistantName", "")
short = state.get("shortName", name)
pronouns = state.get("pronouns", "they/them")
blurb = state.get("personaBlurb", "")
email = state.get("emailAddress", "")
gh_user = state.get("ghUsername", "")

if not name:
    print("  No assistant name in setup state — skipping")
    sys.exit(0)

# Parse pronouns into subject/possessive
pmap = {
    "she/her": ("she", "her"),
    "he/him": ("he", "his"),
    "they/them": ("they", "their"),
}
subj, poss = pmap.get(pronouns, ("they", "their"))

# Read version
version = "0.1.0"
try:
    with open(manifest_path) as f:
        version = json.load(f).get("version", version)
except Exception:
    pass

today = date.today().isoformat()

# Template replacements for all workspace files
replacements = {
    "{{AGENT_NAME}}": name,
    "{{AGENT_SHORT}}": short,
    "{{HUMAN_NAME}}": "my human",
    "{{PRONOUNS}}": pronouns,
    "{{PRONOUNS_SUBJECT}}": subj,
    "{{PRONOUNS_POSSESSIVE}}": poss,
    "{{VERSION}}": version,
    "{{DATE}}": today,
    "{{EMAIL}}": email,
    "{{GITHUB}}": gh_user,
}

for dirpath, _dirs, files in os.walk(workspace):
    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(dirpath, fname)
        with open(fpath) as f:
            content = f.read()
        changed = False
        for placeholder, value in replacements.items():
            if placeholder in content:
                content = content.replace(placeholder, value)
                changed = True
        if changed:
            with open(fpath, "w") as f:
                f.write(content)

print(f"  {name} ({pronouns}) — MiniClaw v{version}")
PERSONALIZE_PYEOF
  ok "Workspace personalized from setup wizard"
else
  info "No setup state or workspace — agent will personalize on first conversation"
fi

# ── Step 17: Import shared KB ─────────────────────────────────────────────────
step "Step 17: Shared knowledge base"

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

# ── Headless config: run post-wizard steps from JSON ─────────────────────────
if [[ -n "$CONFIG_FILE" && -f "$CONFIG_FILE" ]]; then
  step "Headless setup from $CONFIG_FILE"

  # setup-state.json already written above (before step 15e)
  ok "Setup state present"

  # Persist secrets to vault
  VAULT_ROOT="$MINICLAW_DIR/SYSTEM/vault"
  MC_VAULT="$MINICLAW_DIR/vault/cli"
  vault_set() {
    local key="$1" val="$2"
    [[ -z "$val" ]] && return
    echo "$val" | OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" set "$key" - >>"$LOG_FILE" 2>&1 \
      && ok "  vault: $key" || warn "  vault: $key failed"
  }

  # Read all fields using the same names as the web wizard's setup-state.json
  read_cfg() { python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('$1',''))" 2>/dev/null; }

  # Field names match the web wizard forms exactly
  TG_TOKEN=$(read_cfg telegramBotToken)
  GH_TOKEN=$(read_cfg ghToken)
  EMAIL_PASS=$(read_cfg appPassword)
  EMAIL_ADDR=$(read_cfg emailAddress)
  EMAIL_SMTP_HOST=$(read_cfg emailSmtpHost)
  EMAIL_SMTP_PORT=$(read_cfg emailSmtpPort)
  GEMINI_KEY=$(read_cfg geminiKey)

  vault_set "telegram-bot-token" "$TG_TOKEN"
  vault_set "gh-token" "$GH_TOKEN"
  vault_set "email-app-password" "$EMAIL_PASS"
  vault_set "email-address" "$EMAIL_ADDR"
  [[ -n "$EMAIL_SMTP_HOST" ]] && vault_set "smtp-host" "$EMAIL_SMTP_HOST"
  [[ -n "$EMAIL_SMTP_PORT" ]] && vault_set "smtp-port" "$EMAIL_SMTP_PORT"
  vault_set "gemini-api-key" "$GEMINI_KEY"

  # Derive GitHub username from token
  if [[ -n "$GH_TOKEN" ]] && command -v gh &>/dev/null; then
    echo "$GH_TOKEN" | gh auth login --with-token >>"$LOG_FILE" 2>&1
    GH_USERNAME=$(gh api user --jq '.login' 2>/dev/null || echo "")
    if [[ -n "$GH_USERNAME" ]]; then
      python3 -c "
import json
p = '$SETUP_STATE'
with open(p) as f: s = json.load(f)
s['ghUsername'] = '$GH_USERNAME'
s['ghConfigured'] = True
with open(p, 'w') as f: json.dump(s, f, indent=2); f.write('\n')
"
      ok "GitHub: $GH_USERNAME (derived from token)"

      # Seed GitHub setup card now that we know GH is configured
      if [[ -f "$BOARD_DB" ]]; then
        sqlite3 "$BOARD_DB" <<'GHSEED'
INSERT OR IGNORE INTO cards (id, title, col, priority, tags, project_id, created_at, updated_at, problem_description, implementation_plan, acceptance_criteria)
VALUES (
  'crd_seed_github_presence',
  'Set up GitHub presence',
  'backlog',
  'medium',
  '["setup","github"]',
  'prj_setup',
  datetime('now'),
  datetime('now'),
  'GitHub token is configured but the account may not be set up for MiniClaw collaboration. Need to verify: profile avatar, profile README, fork of miniclaw-os, publish any extensions, and ensure contribution graph is visible.',
  '1. Check if GitHub profile has an avatar — if not, upload one.
2. Create or update profile README (username/username repo) with a short bio.
3. Fork augmentedmike/miniclaw-os to the human''s account if not already forked.
4. If any local mc-* extensions exist, publish them as public repos.
5. Ensure contribution graph is set to show all contributions (not private-only).',
  'GitHub profile has an avatar set. Profile README repo exists and is non-empty. miniclaw-os fork exists under the human''s account. Contribution graph is publicly visible.'
);
GHSEED
        ok "GitHub presence setup card created"
      fi
    fi
  fi

  # gh already authenticated above when deriving username

  # Configure gateway (telegram channel)
  TG_USERNAME=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('telegramBotUsername',''))" 2>/dev/null)
  TG_CHAT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('telegramChatId',''))" 2>/dev/null)
  if [[ -n "$TG_USERNAME" && -n "$TG_TOKEN" ]]; then
    python3 - "$STATE_DIR/openclaw.json" "$TG_USERNAME" "$TG_TOKEN" "$TG_CHAT_ID" <<'GWPY'
import json, sys
config_path, bot_id, bot_token, chat_id = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else ""
with open(config_path) as f: cfg = json.load(f)
channels = cfg.setdefault("channels", {})
channels["telegram"] = {
    "enabled": True, "botToken": bot_token,
    "dmPolicy": "pairing", "groupPolicy": "allowlist",
    "groupAllowFrom": [chat_id] if chat_id else [],
    "allowFrom": [chat_id] if chat_id else [],
    "streaming": "partial",
}
with open(config_path, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
GWPY
    ok "Gateway configured (telegram: @$TG_USERNAME)"
  fi

  # Personalize workspace (already happens in step 15e but re-run with full state)
  # The step 15e block above already handles this if SETUP_STATE exists

  # Seed rolodex
  ROLODEX_DIR="$STATE_DIR/USER/rolodex"
  CONTACTS_FILE="$ROLODEX_DIR/contacts.json"
  if [[ ! -f "$CONTACTS_FILE" ]] || [[ "$(python3 -c "import json; print(len(json.load(open('$CONTACTS_FILE'))))" 2>/dev/null)" == "0" ]]; then
    mkdir -p "$ROLODEX_DIR"
    python3 - "$CONFIG_FILE" "$CONTACTS_FILE" <<'SEEDPY'
import json, sys, uuid
from datetime import datetime
cfg = json.load(open(sys.argv[1]))
contacts = [
    {"id": str(uuid.uuid4()), "name": "My Human", "emails": [], "phones": [], "domains": [],
     "tags": ["owner", "human"], "trustStatus": "verified", "lastVerified": datetime.utcnow().isoformat(),
     "notes": "Human owner — added during setup."},
    {"id": str(uuid.uuid4()), "name": cfg.get("assistantName", "MiniClaw"),
     "emails": [cfg["emailAddress"]] if cfg.get("emailAddress") else [], "phones": [], "domains": [],
     "tags": ["agent", "self"], "trustStatus": "verified", "lastVerified": datetime.utcnow().isoformat(),
     "notes": f"AI agent ({cfg.get('shortName', 'mc')}). GitHub: {cfg.get('ghUsername')}." if cfg.get("ghUsername") else f"AI agent ({cfg.get('shortName', 'mc')})."}
]
with open(sys.argv[2], "w") as f: json.dump(contacts, f, indent=2); f.write("\n")
print(f"  Seeded {len(contacts)} contacts")
SEEDPY
    ok "Rolodex seeded"
  fi

  # Start gateway
  if command -v openclaw &>/dev/null; then
    openclaw gateway install --force >>"$LOG_FILE" 2>&1 \
      && ok "Gateway started" || warn "Gateway install failed"
    sleep 3

    # Register cron jobs
    CRON_FILE="$STATE_DIR/cron/jobs.json"
    if [[ -f "$CRON_FILE" ]]; then
      EXISTING_CRONS=$(openclaw cron list --json 2>/dev/null || echo "[]")
      python3 - "$CRON_FILE" "$EXISTING_CRONS" "$STATE_DIR" <<'CRONPY'
import json, sys, os, subprocess
jobs_file, existing_raw, state_dir = sys.argv[1], sys.argv[2], sys.argv[3]
store = json.load(open(jobs_file))
try:
    parsed = json.loads(existing_raw)
    existing = parsed if isinstance(parsed, list) else parsed.get("jobs", [])
    existing_names = {j.get("name") for j in existing}
except: existing_names = set()
for job in store.get("jobs", []):
    if job["name"] in existing_names: continue
    expr = job.get("schedule", {}).get("expr", "*/5 * * * *")
    args = ["openclaw", "cron", "add", "--name", job["name"], "--cron", expr, "--session", job.get("sessionTarget", "isolated"), "--agent", job.get("agentId", "cron")]
    if job.get("payload", {}).get("messageFile"):
        prompt_path = os.path.join(state_dir, "cron", job["payload"]["messageFile"])
        if os.path.exists(prompt_path):
            with open(prompt_path) as f: args += ["--message", f.read().strip()]
    r = subprocess.run(args, capture_output=True, text=True, timeout=10)
    status = "ok" if r.returncode == 0 else "fail"
    print(f"  cron {job['name']}: {status}")
CRONPY
      ok "Cron jobs registered"
    fi
  fi

  # Send welcome email from the agent to itself
  if [[ -n "$EMAIL_ADDR" && -n "$EMAIL_PASS" ]]; then
    AGENT_NAME=$(read_cfg assistantName)
    python3 - "$EMAIL_ADDR" "$EMAIL_PASS" "${EMAIL_SMTP_HOST:-smtp.gmail.com}" "${EMAIL_SMTP_PORT:-587}" "$AGENT_NAME" <<'WELCOMEPY'
import smtplib, sys, ssl
from email.message import EmailMessage
addr, pw, host, port, name = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
msg = EmailMessage()
msg["Subject"] = f"Hello from {name}"
msg["From"] = addr
msg["To"] = addr
msg.set_content(f"Hi! I'm {name}, your MiniClaw AI assistant. I just finished setting up and I'm ready to work.\n\nThis email confirms that my email is configured and working.\n\n— {name}")
try:
    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as s:
            s.login(addr, pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(addr, pw)
            s.send_message(msg)
    print("  Welcome email sent")
except Exception as e:
    print(f"  Welcome email failed: {e}")
WELCOMEPY
    ok "Welcome email sent to $EMAIL_ADDR"
  fi

  # Mark complete
  python3 -c "
import json
p = '$SETUP_STATE'
with open(p) as f: s = json.load(f)
s['complete'] = True
from datetime import datetime
s['completedAt'] = datetime.utcnow().isoformat()
s['secretsPersisted'] = True
with open(p, 'w') as f: json.dump(s, f, indent=2); f.write('\n')
"
  ok "Setup marked complete"

  # Run mc-smoke with full PATH
  step "Verification"
  source "$HOME/.zshenv" 2>/dev/null || true
  export PATH="$MINICLAW_DIR/SYSTEM/bin:$STATE_DIR/USER/bin:$NPM_GLOBAL_BIN:$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
  if command -v mc-smoke &>/dev/null; then
    mc-smoke && ok "mc-smoke passed" || warn "mc-smoke had failures — check output above"
  else
    warn "mc-smoke not found on PATH (checked: $MINICLAW_DIR/SYSTEM/bin)"
  fi
fi

# ── Post-install: vault key migrations ────────────────────────────────────────
VAULT_BIN="$SYSTEM_BIN/mc-vault"
if [[ -x "$VAULT_BIN" ]]; then
  # Migrate legacy gmail-app-password → email-app-password
  if "$VAULT_BIN" get gmail-app-password &>/dev/null; then
    LEGACY_PASS=$("$VAULT_BIN" get gmail-app-password 2>/dev/null)
    if [[ -n "$LEGACY_PASS" ]] && ! "$VAULT_BIN" get email-app-password &>/dev/null; then
      "$VAULT_BIN" set email-app-password "$LEGACY_PASS" &>/dev/null && \
        ok "Migrated vault: gmail-app-password → email-app-password"
    fi
  fi
  # Migrate legacy gmail-email → email-address
  if "$VAULT_BIN" get gmail-email &>/dev/null; then
    LEGACY_EMAIL=$("$VAULT_BIN" get gmail-email 2>/dev/null)
    if [[ -n "$LEGACY_EMAIL" ]] && ! "$VAULT_BIN" get email-address &>/dev/null; then
      "$VAULT_BIN" set email-address "$LEGACY_EMAIL" &>/dev/null && \
        ok "Migrated vault: gmail-email → email-address"
    fi
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${NC}"
echo ""
echo "  MiniClaw: http://localhost:4220"
echo "  Verify:   mc-smoke"
echo ""

# Open the setup wizard if interactive (no --config, not from bootstrap)
if [[ -z "$CONFIG_FILE" && -z "${MINICLAW_NONINTERACTIVE:-}" ]]; then
  sleep 2
  open "http://localhost:4220"
fi
