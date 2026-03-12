#!/usr/bin/env bash
# sync-dev.sh — sync miniclaw-os repo → live ~/.openclaw/miniclaw/
#
# Rsyncs plugins and system/bin from the project repo to the live install.
# Run this after making changes in ~/.openclaw/projects/miniclaw-os/ to test them live.
#
# Usage:
#   ./scripts/sync-dev.sh            # sync plugins + system/bin
#   ./scripts/sync-dev.sh --check    # dry-run, show what would change
#   ./scripts/sync-dev.sh --reload   # sync + signal OpenClaw to reload plugins

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ~/.openclaw is openclaw's default home directory
MINICLAW_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/miniclaw"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"

DRY_RUN=false
RELOAD=false
for arg in "$@"; do
  [[ "$arg" == "--check" ]] && DRY_RUN=true
  [[ "$arg" == "--reload" ]] && RELOAD=true
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${NC} $1"; }
info() { echo -e "  ${BLUE}[→]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }

echo ""
echo -e "${BOLD}miniclaw sync-dev${NC}"
echo "  from: $REPO_DIR"
echo "  to:   $MINICLAW_DIR"
[[ "$DRY_RUN" == true ]] && echo "  (dry-run — no changes)"
echo ""

RSYNC_FLAGS="-av --exclude='node_modules' --exclude='.git' --exclude='*.log'"
[[ "$DRY_RUN" == true ]] && RSYNC_FLAGS="$RSYNC_FLAGS --dry-run"

# ── Plugins ───────────────────────────────────────────────────────────────────
info "Syncing plugins..."
eval rsync $RSYNC_FLAGS \
  "$REPO_DIR/plugins/" \
  "$MINICLAW_DIR/plugins/" \
  | grep -v '/$' | grep -v '^sending' | grep -v '^sent' | grep -v '^total' | grep -v '^$' | head -40 || true
ok "plugins/"

# ── System bin ────────────────────────────────────────────────────────────────
info "Syncing system/bin → $LOCAL_BIN..."
for bin_src in "$REPO_DIR/system/bin"/*; do
  [[ -f "$bin_src" ]] || continue
  bin_name="$(basename "$bin_src")"
  if [[ "$DRY_RUN" == true ]]; then
    warn "would copy: $bin_name → $LOCAL_BIN/$bin_name"
  else
    cp "$bin_src" "$LOCAL_BIN/$bin_name"
    chmod +x "$LOCAL_BIN/$bin_name"
    ok "system/bin/$bin_name"
  fi
done

# ── Plugin deps ───────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == false ]]; then
  info "Installing plugin deps..."
  for plugin_dest in "$MINICLAW_DIR/plugins"/*/; do
    if [[ -f "$plugin_dest/package.json" ]]; then
      plugin_name="$(basename "$plugin_dest")"
      (cd "$plugin_dest" && bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null) \
        && ok "$plugin_name deps" \
        || warn "$plugin_name bun install failed"
    fi
  done
fi

# ── Reload ────────────────────────────────────────────────────────────────────
if [[ "$RELOAD" == true && "$DRY_RUN" == false ]]; then
  echo ""
  info "Signaling OpenClaw to reload plugins..."
  OC_PID=$(pgrep -f "openclaw.*gateway\|openclaw.*server" 2>/dev/null | head -1 || echo "")
  if [[ -n "$OC_PID" ]]; then
    kill -SIGUSR1 "$OC_PID" && ok "Sent SIGUSR1 to OpenClaw (PID $OC_PID)"
  else
    warn "OpenClaw process not found — restart manually to pick up plugin changes"
  fi
fi

echo ""
echo -e "${GREEN}${BOLD}Sync complete.${NC}"
[[ "$RELOAD" == false ]] && echo "  Tip: use --reload to also signal OpenClaw to hot-reload plugins."
echo ""
