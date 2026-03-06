#!/usr/bin/env bash
# backport-from-live.sh — sync ~/am/miniclaw/plugins/ → miniclaw-os repo
#
# ~/am/ is the live prototype workspace (OPENCLAW_STATE_DIR).
# This script backports plugin changes from there into the clean repo.
# ~/.openclaw/ is only used for install testing — never source from there.
#
# Usage:
#   ./scripts/backport-from-live.sh              # sync + show git diff --stat
#   ./scripts/backport-from-live.sh --check      # dry-run, show what would change
#   ./scripts/backport-from-live.sh --commit      # sync + auto-create a git commit
#   ./scripts/backport-from-live.sh --new-plugins # also allow syncing plugin dirs not yet in repo

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINICLAW_DIR="${OPENCLAW_STATE_DIR:-$HOME/am}/miniclaw"

DRY_RUN=false
DO_COMMIT=false
NEW_PLUGINS=false
for arg in "$@"; do
  [[ "$arg" == "--check" ]]       && DRY_RUN=true
  [[ "$arg" == "--commit" ]]      && DO_COMMIT=true
  [[ "$arg" == "--new-plugins" ]] && NEW_PLUGINS=true
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${NC} $1"; }
info() { echo -e "  ${BLUE}[→]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
err()  { echo -e "  ${RED}[✗]${NC} $1"; }

echo ""
echo -e "${BOLD}miniclaw backport-from-live${NC}"
echo "  from: $MINICLAW_DIR/plugins/  (~/am live prototype)"
echo "  to:   $REPO_DIR/plugins/"
[[ "$DRY_RUN"    == true ]] && echo "  (dry-run — no changes)"
[[ "$NEW_PLUGINS" == true ]] && echo "  (--new-plugins: will add new plugin dirs)"
echo ""

# ── Safety: source must exist ─────────────────────────────────────────────────
if [[ ! -d "$MINICLAW_DIR/plugins" ]]; then
  err "Live plugins dir not found: $MINICLAW_DIR/plugins"
  exit 1
fi

# ── Exclusion list — AM-specific data must NOT go to repo ─────────────────────
EXCLUDES=(
  --exclude='node_modules/'
  --exclude='.next/'
  --exclude='*.db'
  --exclude='.env'
  --exclude='.env.*'
  --exclude='.env.local'
  --exclude='user/'
  --exclude='*.age'
  --exclude='dist/'
  --exclude='*.log'
  --exclude='.git/'
  --exclude='.DS_Store'
)

# ── Determine which plugins to sync ──────────────────────────────────────────
# Default: only sync plugin dirs that already exist in the repo
PLUGIN_DIRS=()
for live_plugin in "$MINICLAW_DIR/plugins"/*/; do
  plugin_name="$(basename "$live_plugin")"
  repo_plugin="$REPO_DIR/plugins/$plugin_name"
  if [[ -d "$repo_plugin" ]]; then
    PLUGIN_DIRS+=("$plugin_name")
  elif [[ "$NEW_PLUGINS" == true ]]; then
    warn "New plugin detected (adding): $plugin_name"
    PLUGIN_DIRS+=("$plugin_name")
  else
    info "Skipping live-only plugin (use --new-plugins to include): $plugin_name"
  fi
done

if [[ ${#PLUGIN_DIRS[@]} -eq 0 ]]; then
  warn "No plugins to sync."
  exit 0
fi

# ── Rsync each plugin ─────────────────────────────────────────────────────────
info "Syncing plugins..."
RSYNC_FLAGS=(-av --delete "${EXCLUDES[@]}")
[[ "$DRY_RUN" == true ]] && RSYNC_FLAGS+=(--dry-run)

CHANGED=false
for plugin_name in "${PLUGIN_DIRS[@]}"; do
  src="$MINICLAW_DIR/plugins/$plugin_name/"
  dst="$REPO_DIR/plugins/$plugin_name/"
  output=$(rsync "${RSYNC_FLAGS[@]}" "$src" "$dst" \
    | grep -v '/$' | grep -v '^sending' | grep -v '^sent' | grep -v '^total' | grep -v '^$' \
    | grep -v '^deleting' || true)
  if [[ -n "$output" ]]; then
    CHANGED=true
    echo "    $plugin_name:"
    echo "$output" | head -20 | sed 's/^/      /'
  fi
  ok "$plugin_name"
done

# ── Git diff summary ──────────────────────────────────────────────────────────
echo ""
if [[ "$DRY_RUN" == false ]]; then
  info "Git diff summary:"
  cd "$REPO_DIR"
  DIFF_STAT=$(git diff --stat HEAD -- plugins/ 2>/dev/null || true)
  if [[ -n "$DIFF_STAT" ]]; then
    echo "$DIFF_STAT"
  else
    ok "No changes detected (repo already matches live)"
    CHANGED=false
  fi
fi

# ── Hardcoded path check ──────────────────────────────────────────────────────
echo ""
info "Checking for hardcoded user paths..."
HARDCODED=$(grep -r "/Users/" "$REPO_DIR/plugins/" \
  --include="*.ts" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  -l 2>/dev/null || true)
if [[ -n "$HARDCODED" ]]; then
  warn "Hardcoded /Users/ paths found — sanitize before committing:"
  echo "$HARDCODED" | sed 's/^/    /'
else
  ok "No hardcoded /Users/ paths found"
fi

# ── Auto-commit ───────────────────────────────────────────────────────────────
if [[ "$DO_COMMIT" == true && "$DRY_RUN" == false && "$CHANGED" == true ]]; then
  echo ""
  info "Creating commit..."
  cd "$REPO_DIR"
  git add plugins/
  COMMIT_MSG="chore(backport): sync live plugins → repo ($(date '+%Y-%m-%d %H:%M'))"
  git commit -m "$COMMIT_MSG" && ok "Committed: $COMMIT_MSG" || warn "Nothing to commit"
fi

echo ""
echo -e "${GREEN}${BOLD}Backport complete.${NC}"
if [[ "$DRY_RUN" == false && "$DO_COMMIT" == false ]]; then
  echo "  Review the diff above, sanitize any hardcoded paths, then commit manually."
  echo "  Tip: use --commit to auto-create a commit after syncing."
fi
echo ""
