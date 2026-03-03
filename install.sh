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

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
MINICLAW_DIR="$OPENCLAW_DIR/miniclaw"
PROJECTS_DIR="$OPENCLAW_DIR/projects"
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

# ── Step 4: OpenClaw ──────────────────────────────────────────────────────────
step "Step 4: OpenClaw"

if command -v openclaw &>/dev/null; then
  INSTALLED=$(openclaw --version 2>/dev/null | head -1 || echo "?")
  LATEST=$(npm show openclaw version 2>/dev/null || echo "?")
  if [[ "$INSTALLED" == "$LATEST" ]]; then
    ok "OpenClaw $INSTALLED (latest)"
  elif [[ "$CHECK_ONLY" == true ]]; then
    warn "OpenClaw $INSTALLED installed, latest is $LATEST"
  else
    info "Updating OpenClaw $INSTALLED → $LATEST..."
    npm install -g openclaw@latest && ok "OpenClaw updated to $(openclaw --version 2>/dev/null | head -1)"
  fi
elif [[ "$CHECK_ONLY" == true ]]; then
  fail "OpenClaw not installed"
else
  info "Installing OpenClaw..."
  npm install -g openclaw@latest || die "OpenClaw install failed"
  ok "OpenClaw $(openclaw --version 2>/dev/null | head -1) installed"
fi

# Init ~/.openclaw if needed
if [[ ! -d "$OPENCLAW_DIR" ]]; then
  [[ "$CHECK_ONLY" == true ]] && fail "~/.openclaw not found" || mkdir -p "$OPENCLAW_DIR"
fi

if [[ ! -f "$OPENCLAW_DIR/openclaw.json" ]]; then
  if [[ "$CHECK_ONLY" == true ]]; then
    warn "openclaw.json not found"
  else
    python3 - "$OPENCLAW_DIR/openclaw.json" <<'PYEOF'
import json, sys
cfg = {
  "meta": {},
  "agents": { "defaults": { "model": { "primary": "claude-sonnet-4-6" }, "compaction": { "mode": "safeguard" } } },
  "plugins": {}
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2); f.write("\n")
PYEOF
    ok "openclaw.json created"
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

python3 - "$OPENCLAW_DIR/openclaw.json" "$MINICLAW_DIR" <<'PYEOF'
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

plugin_defaults = {
    "mc-board": {
        "enabled": True,
        "config": { "cardsDir": "~/.openclaw/user/brain/cards", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "mc-board", "webPort": 4220 },
    },
    "mc-designer": {
        "enabled": True,
        "config": { "apiKey": "", "model": "gemini-2.0-flash-exp", "mediaDir": "~/.openclaw/media/designer", "defaultWidth": 1024, "defaultHeight": 1024 },
    },
    "mc-trust": {
        "enabled": True,
        "config": { "agentId": "am", "trustDir": "~/.openclaw/trust", "vaultBin": "~/.openclaw/miniclaw/system/bin/mc-vault", "sessionTtlMs": 3600000 },
    },
    "mc-context": {
        "enabled": True,
        "config": { "windowMinutes": 60, "windowMinMessages": 10, "maxImagesInHistory": 2, "applyToChannels": True, "applyToDMs": True, "replaceMessages": True },
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
for bin_src in "$REPO_DIR/system/bin"/*; do
  [[ -f "$bin_src" ]] || continue
  bin_name="$(basename "$bin_src")"
  cp "$bin_src" "$LOCAL_BIN/$bin_name"
  chmod +x "$LOCAL_BIN/$bin_name"
  ok "Installed: $bin_name"
done

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  warn "$LOCAL_BIN not in PATH — add to ~/.zshrc: export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  ok "$LOCAL_BIN in PATH"
fi

# ── Step 9: Directories ───────────────────────────────────────────────────────
step "Step 9: User directories"

USER_MEMORY_DIR="$OPENCLAW_DIR/user/memory"
SOUL_BACKUPS_DIR="$OPENCLAW_DIR/soul-backups"

mkdir -p "$USER_MEMORY_DIR"
ok "~/.openclaw/user/memory/"

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

VAULT_ROOT="$MINICLAW_DIR/system/vault"
MC_VAULT="$LOCAL_BIN/mc-vault"

if [[ ! -f "$VAULT_ROOT/key.txt" ]]; then
  OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" init
  ok "Vault initialised"
else
  ok "Vault already initialised"
fi

echo ""
echo "  Enter secrets (leave blank to skip):"
echo ""

VAULT_SECRETS=(
  "gh-token:GitHub personal access token"
  "gmail-app-password:Gmail app password"
)

for entry in "${VAULT_SECRETS[@]}"; do
  key="${entry%%:*}"; desc="${entry#*:}"
  printf "  %s (%s)\n  > " "$key" "$desc"
  read -r -s value; echo ""
  if [[ -n "$value" ]]; then
    echo -n "$value" | OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" set "$key" -
    ok "Stored: $key"
  else
    warn "Skipped: $key"
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${NC}"
echo ""
echo "  Verify:  mc-smoke"
echo "  Restart OpenClaw to load plugins."
echo ""
