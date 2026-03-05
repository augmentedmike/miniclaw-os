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
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
# STATE_DIR is where runtime data lives (cards, logs, cron, workspace, etc.)
# Defaults to OPENCLAW_DIR so a fresh install "just works".
STATE_DIR="${OPENCLAW_STATE_DIR:-$OPENCLAW_DIR}"
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
if [[ ! -d "$OPENCLAW_DIR" ]]; then
  [[ "$CHECK_ONLY" == true ]] && fail "$OPENCLAW_DIR not found" || mkdir -p "$OPENCLAW_DIR"
fi
if [[ "$STATE_DIR" != "$OPENCLAW_DIR" && ! -d "$STATE_DIR" ]]; then
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

plugin_defaults = {
    "mc-board": {
        "enabled": True,
        "config": { "cardsDir": state_dir + "/user/brain/cards", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "mc-board", "webPort": 4220 },
    },
    "mc-context": {
        "enabled": True,
        "config": { "windowMinutes": 60, "windowMinMessages": 10, "maxImagesInHistory": 2, "applyToChannels": True, "applyToDMs": True, "replaceMessages": True },
    },
    "mc-designer": {
        "enabled": True,
        "config": { "apiKey": "", "model": "gemini-3.1-flash-image-preview", "mediaDir": state_dir + "/media/designer", "defaultWidth": 1024, "defaultHeight": 1024, "vaultBin": "~/.local/bin/mc-vault" },
    },
    "mc-kb": {
        "enabled": True,
        "config": { "dbDir": state_dir + "/user/brain/kb", "modelPath": "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf", "qmdBin": "~/.bun/bin/qmd", "qmdCollection": "kb", "contextN": 3, "contextThreshold": 0.75 },
    },
    "mc-queue": {
        "enabled": True,
        "config": { "enabled": True, "haikuModel": "claude-haiku-4-5-20251001", "maxToolCallsPerTurn": 3, "applyToChannels": True, "applyToDMs": True, "tgLogChatId": "", "tgBotName": "@augmentedmike_bot", "boardUrl": "" },
    },
    "mc-soul": {
        "enabled": True,
        "config": {},
    },
    "mc-trust": {
        "enabled": True,
        "config": { "agentId": "am", "trustDir": state_dir + "/trust", "vaultBin": mcl_dir + "/system/bin/mc-vault", "sessionTtlMs": 3600000 },
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

if ! tty -s && [[ ! -e /dev/tty ]]; then
  warn "No terminal available — skipping secret prompts. Run ./install.sh directly to enter secrets."
else
  # Read from /dev/tty directly so this works even when stdin is a pipe (curl | bash)
  TTY_IN=/dev/tty

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
    read -r -s value < "$TTY_IN"; echo ""
    if [[ -n "$value" ]]; then
      echo -n "$value" | OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" set "$key" -
      ok "Stored: $key"
    else
      warn "Skipped: $key"
    fi
  done

  # ── mc-designer (optional) ─────────────────────────────────────────────────
  echo ""
  printf "  Enable mc-designer (AI image generation)? [y/N] "
  read -r enable_designer < "$TTY_IN"
  if [[ "$enable_designer" == "y" || "$enable_designer" == "Y" ]]; then
    echo ""
    echo "  Get a free Gemini API key at: https://aistudio.google.com/app/apikey"
    printf "  Gemini API key\n  > "
    read -r -s gemini_key < "$TTY_IN"; echo ""
    if [[ -n "$gemini_key" ]]; then
      echo -n "$gemini_key" | OPENCLAW_VAULT_ROOT="$VAULT_ROOT" "$MC_VAULT" set gemini-api-key -
      ok "Stored: gemini-api-key"
    else
      warn "Skipped: gemini-api-key (mc-designer will prompt when you first use it)"
    fi
  else
    warn "Skipped: mc-designer setup (run install.sh again or use 'mc vault set gemini-api-key' to enable later)"
  fi
fi

# ── Step 12: Brain board crons ────────────────────────────────────────────────
step "Step 12: Brain board cron workers"

OC_PORT="${OPENCLAW_PORT:-18789}"
OC_TOKEN_FILE="$OPENCLAW_DIR/gateway-token.txt"
OC_API="http://127.0.0.1:$OC_PORT"

register_cron() {
  local name="$1"
  local payload="$2"
  # Check if already registered
  existing=$(curl -sf -H "Authorization: Bearer $(cat "$OC_TOKEN_FILE" 2>/dev/null)" \
    "$OC_API/api/cron/jobs" 2>/dev/null | python3 -c "
import sys,json
jobs=json.load(sys.stdin).get('jobs',[])
print(next((j['id'] for j in jobs if j.get('name')=='$name'),''))
" 2>/dev/null || echo "")
  if [[ -n "$existing" ]]; then
    ok "Cron '$name' already registered ($existing)"
    return
  fi
  result=$(curl -sf -X POST \
    -H "Authorization: Bearer $(cat "$OC_TOKEN_FILE" 2>/dev/null)" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$OC_API/api/cron/jobs" 2>/dev/null || echo "")
  if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null | grep -q .; then
    ok "Cron '$name' registered"
  else
    warn "Could not register '$name' — OpenClaw may not be running. Run install.sh again after starting OpenClaw."
  fi
}

register_cron "board-worker-backlog" '{
  "name": "board-worker-backlog",
  "schedule": {"kind": "cron", "expr": "*/5 * * * *"},
  "sessionTarget": "isolated",
  "model": "claude-haiku-4-5-20251001",
  "payload": {
    "kind": "agentTurn",
    "timeoutSeconds": 600,
    "message": "Board worker — BACKLOG triage.\n\nMAX_CONCURRENT_COLUMN_TASKS=3.\n\n0. INTEGRITY CHECK: openclaw mc-board check-dupes --fix\n   (removes stale duplicate card files before any work begins)\n\n1. Check what is already being worked: openclaw mc-board active\n2. Get full column context (excludes on-hold cards): openclaw mc-board context --column backlog --skip-hold\n3. Group cards by project. For each project pick at most 1 card — highest priority, then oldest. Skip any card already in the active list.\n   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.\n4. For each selected card:\n   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-backlog\n   b. Read full detail: openclaw mc-board show <id>\n   c. Fill any missing fields (problem, plan, criteria) — research what is needed\n   d. Move to in-progress: openclaw mc-board move <id> in-progress\n   e. Release: openclaw mc-board release <id> --worker board-worker-backlog\n5. Done. Silent exit."
  },
  "delivery": {"mode": "none"}
}'

register_cron "board-worker-in-progress" '{
  "name": "board-worker-in-progress",
  "schedule": {"kind": "cron", "expr": "1-59/5 * * * *"},
  "sessionTarget": "isolated",
  "model": "claude-haiku-4-5-20251001",
  "payload": {
    "kind": "agentTurn",
    "timeoutSeconds": 600,
    "message": "Board worker — IN-PROGRESS triage.\n\nMAX_CONCURRENT_COLUMN_TASKS=3. You may work on at most 3 cards, selecting the best candidate per project.\n\n1. Check active workers: openclaw mc-board active\n2. Get full column context (excludes on-hold): openclaw mc-board context --column in-progress --skip-hold\n3. Group by project. Per project pick 1 card — highest priority then oldest. Skip cards already active.\n   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.\n4. For each selected card:\n   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-in-progress\n   b. Read full detail: openclaw mc-board show <id>\n   c. Do one unit of work toward completing it — whatever the plan calls for next\n   d. Check off any acceptance criteria now met (- [x])\n   e. Update notes with what was done: openclaw mc-board update <id> --notes \"<what was done>\"\n   f. If all criteria checked: openclaw mc-board move <id> in-review\n   g. Release: openclaw mc-board release <id> --worker board-worker-in-progress\n5. Done. Silent exit."
  },
  "delivery": {"mode": "none"}
}'

register_cron "board-worker-in-review" '{
  "name": "board-worker-in-review",
  "schedule": {"kind": "cron", "expr": "2-59/5 * * * *"},
  "sessionTarget": "isolated",
  "model": "claude-haiku-4-5-20251001",
  "payload": {
    "kind": "agentTurn",
    "timeoutSeconds": 600,
    "message": "Board worker — IN-REVIEW triage.\n\nMAX_CONCURRENT_COLUMN_TASKS=3. Select best candidate per project.\n\n1. Check active workers: openclaw mc-board active\n2. Get full column context (excludes on-hold): openclaw mc-board context --column in-review --skip-hold\n3. Group by project. Per project pick 1 card — highest priority then oldest. Skip cards already active.\n   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.\n4. For each selected card:\n   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-in-review\n   b. Read full detail: openclaw mc-board show <id>\n   c. Audit: verify the work product exists and all criteria are genuinely met\n   d. If it holds up:\n      - openclaw mc-board update <id> --review \"Audited [date]: [what was checked, findings]\"\n      - openclaw mc-board move <id> shipped\n      - IMMEDIATELY create a VERIFY card in backlog using brain_create_card:\n          title: \"VERIFY: [original card title]\"\n          project_id: [same as shipped card]\n          priority: high\n          column: backlog\n          problem: \"Confirm [shipped card title] ([shipped card id]) is live and working in production.\"\n          plan: \"1. PRODUCTION CHECK: verify the shipped work is actually live and functional (hit the URL, run the CLI, check the page, confirm the deploy).\\n2. DOCUMENT SWEEP: scan card notes and any /tmp or workspace paths mentioned — find files/docs created during the work. For each: if a knowledge doc (md, txt, research) move to ~/am/workspace/docs/ or relevant subdir then kb_add it; if an artifact (image, PDF, video) move to ~/am/workspace/artifacts/ and note path in KB; if already in workspace just kb_add if not yet indexed.\\n3. END-TO-END TEST: exercise the main use case — not just that it exists but that it works.\\n4. PASS: move this card to shipped. FAIL: create a bug card linked to original, move this card to backlog.\"\n          criteria: \"- [ ] Production verified live\\n- [ ] Documents/artifacts moved to workspace (if any)\\n- [ ] Documents indexed in KB (if any)\\n- [ ] End-to-end test passed\"\n   e. If it fails:\n      - Uncheck failed criteria and add a note explaining what is wrong\n      - openclaw mc-board update <id> --notes \"Review failed: <reason>\"\n      - Leave in in-review for another pass\n   f. Release: openclaw mc-board release <id> --worker board-worker-in-review\n5. Done. Silent exit."
  },
  "delivery": {"mode": "none"}
}'

# ── Step 13: Shell env ────────────────────────────────────────────────────────
step "Step 13: Shell environment"

for rcfile in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [[ -f "$rcfile" ]] || continue
  if grep -q "OPENCLAW_STATE_DIR" "$rcfile"; then
    ok "OPENCLAW_STATE_DIR already in $rcfile"
  else
    echo "" >> "$rcfile"
    echo "# MiniClaw — OpenClaw state directory" >> "$rcfile"
    echo "export OPENCLAW_STATE_DIR=\"$STATE_DIR\"" >> "$rcfile"
    ok "Added OPENCLAW_STATE_DIR=$STATE_DIR to $rcfile"
  fi
done

# ── Step 14: Board web LaunchAgent ────────────────────────────────────────────
step "Step 14: Board web server LaunchAgent"

BOARD_PLIST="$HOME/Library/LaunchAgents/com.miniclaw.board-web.plist"
if [[ ! -f "$BOARD_PLIST" ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
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
    <string>$MINICLAW_DIR/plugins/mc-board/web/standalone.mjs</string>
  </array>
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
else
  ok "Board web LaunchAgent already exists"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}miniclaw-os installed.${NC}"
echo ""
echo "  Board:   http://localhost:4220"
echo "  Verify:  mc-smoke"
echo "  Restart OpenClaw to load plugins."
echo ""
