#!/usr/bin/env bash
# relocate-home.sh — move .openclaw to ~/{nickname} and update all references
#
# Usage:
#   ./relocate-home.sh <nickname>
#   e.g. ./relocate-home.sh am
#
# If ~/<nickname> already exists, warns and requires --force (backs up existing).
# Skips if STATE_DIR is already not ~/.openclaw (user pre-configured).

set -euo pipefail

NICKNAME="${1:?Usage: relocate-home.sh <nickname>}"
NICKNAME=$(echo "$NICKNAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')

OLD_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

# Nothing to do if already relocated (not .openclaw)
if [[ "$OLD_DIR" != "$HOME/.openclaw" ]]; then
  echo "SKIP: STATE_DIR is already $OLD_DIR (not .openclaw)"
  exit 0
fi

# Nothing to do if .openclaw doesn't exist
if [[ ! -d "$OLD_DIR" ]]; then
  echo "SKIP: $OLD_DIR does not exist"
  exit 0
fi

# Determine target
NEW_DIR="$HOME/$NICKNAME"
if [[ -e "$NEW_DIR" ]]; then
  echo "CONFLICT: ~/$NICKNAME already exists — will be overwritten"
  echo "CONFLICT_PATH=$NEW_DIR"
  # Caller (API route) must confirm with the user before passing --force
  if [[ "${2:-}" != "--force" ]]; then
    exit 2  # exit 2 = conflict, needs confirmation
  fi
  # Move existing dir out of the way
  BACKUP="$HOME/${NICKNAME}.backup.$(date +%s)"
  mv "$NEW_DIR" "$BACKUP"
  echo "  Backed up existing ~/$NICKNAME → $BACKUP"
fi

echo "Relocating: $OLD_DIR → $NEW_DIR"

# ── 0. Collision scan — find things that reference the old path ────────────
WARNINGS=0

# Check system crontab for references to old path
CRON_HITS=$(crontab -l 2>/dev/null | grep -c "$OLD_DIR" || true)
if [[ "$CRON_HITS" -gt 0 ]]; then
  echo "  WARNING: $CRON_HITS crontab entries reference $OLD_DIR — these will NOT be updated automatically"
  crontab -l 2>/dev/null | grep "$OLD_DIR" | while read -r line; do
    echo "    → $line"
  done
  WARNINGS=$((WARNINGS + 1))
fi

# Check non-miniclaw LaunchAgents/Daemons that reference old path
for plist in "$HOME/Library/LaunchAgents/"*.plist /Library/LaunchDaemons/*.plist; do
  [[ -f "$plist" ]] || continue
  [[ "$(basename "$plist")" == com.miniclaw.* ]] && continue
  if grep -q "$OLD_DIR" "$plist" 2>/dev/null; then
    echo "  WARNING: $(basename "$plist") references $OLD_DIR — will NOT be updated"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# Check for running processes with open files in old dir (besides our own services)
OPEN_PROCS=$(lsof +D "$OLD_DIR" 2>/dev/null | grep -v "^COMMAND" | awk '{print $1 "(" $2 ")"}' | sort -u | head -5 || true)
if [[ -n "$OPEN_PROCS" ]]; then
  echo "  WARNING: Processes with open files in $OLD_DIR:"
  echo "    $OPEN_PROCS"
  echo "    (move may succeed on macOS but these processes will use stale paths on restart)"
  WARNINGS=$((WARNINGS + 1))
fi

# Check for symlinks pointing into old dir
SYMLINKS=$(find "$HOME" -maxdepth 2 -lname "*$OLD_DIR*" 2>/dev/null | head -5 || true)
if [[ -n "$SYMLINKS" ]]; then
  echo "  WARNING: Symlinks pointing into $OLD_DIR (will break):"
  echo "$SYMLINKS" | while read -r link; do
    echo "    → $link"
  done
  WARNINGS=$((WARNINGS + 1))
fi

if [[ "$WARNINGS" -gt 0 ]]; then
  echo "  $WARNINGS warning(s) — proceeding anyway (manual fixup may be needed)"
fi

# ── 1. Stop LaunchAgents ───────────────────────────────────────────────────
PLIST_DIR="$HOME/Library/LaunchAgents"
MINICLAW_PLISTS=()
for plist in "$PLIST_DIR"/com.miniclaw.*.plist; do
  [[ -f "$plist" ]] || continue
  MINICLAW_PLISTS+=("$plist")
  launchctl unload "$plist" 2>/dev/null || true
done
echo "  Stopped ${#MINICLAW_PLISTS[@]} LaunchAgent(s)"

# ── 2. Move the directory ─────────────────────────────────────────────────
mv "$OLD_DIR" "$NEW_DIR"
echo "  Moved $OLD_DIR → $NEW_DIR"

# ── 3. Update shell profile ───────────────────────────────────────────────
for rcfile in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [[ -f "$rcfile" ]] || continue
  if grep -q "OPENCLAW_STATE_DIR" "$rcfile"; then
    sed -i '' "s|OPENCLAW_STATE_DIR=\"$OLD_DIR\"|OPENCLAW_STATE_DIR=\"$NEW_DIR\"|g" "$rcfile"
    sed -i '' "s|OPENCLAW_STATE_DIR=$OLD_DIR|OPENCLAW_STATE_DIR=\"$NEW_DIR\"|g" "$rcfile"
    echo "  Updated OPENCLAW_STATE_DIR in $rcfile"
  fi
  if grep -q "MINICLAW_HOME=" "$rcfile"; then
    sed -i '' "s|MINICLAW_HOME=\"$OLD_DIR/miniclaw\"|MINICLAW_HOME=\"$NEW_DIR/miniclaw\"|g" "$rcfile"
    echo "  Updated MINICLAW_HOME in $rcfile"
  fi
done

# ── 4. Rewrite LaunchAgent plists ──────────────────────────────────────────
for plist in "${MINICLAW_PLISTS[@]}"; do
  sed -i '' "s|$OLD_DIR|$NEW_DIR|g" "$plist"
  echo "  Rewrote paths in $(basename "$plist")"
done

# ── 5. Reload LaunchAgents ─────────────────────────────────────────────────
for plist in "${MINICLAW_PLISTS[@]}"; do
  # Don't reload the setup wizard — it's done its job
  if [[ "$(basename "$plist")" == "com.miniclaw.am-setup.plist" ]]; then
    echo "  Skipped reload of am-setup (wizard complete)"
    continue
  fi
  launchctl load "$plist" 2>/dev/null || true
  echo "  Reloaded $(basename "$plist")"
done

# ── 6. Export for current shell ────────────────────────────────────────────
echo ""
echo "Done. New home: $NEW_DIR"
echo "OPENCLAW_STATE_DIR=$NEW_DIR"
