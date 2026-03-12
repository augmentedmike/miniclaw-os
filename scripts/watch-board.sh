#!/usr/bin/env bash
# watch-board.sh — track ticket movement for N minutes and report tuning health
# Usage: ./watch-board.sh [minutes=10]

set -euo pipefail

MINUTES="${1:-10}"
ACTIVE_FILE="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/USER/brain/active-work.json"
INTERVAL=15   # poll every 15s
END_TIME=$(( $(date +%s) + MINUTES * 60 ))

declare -A PICKUP_TIME
declare -A PICKUP_WORKER
declare -A CARD_COLUMNS
declare -a EVENTS=()
TOTAL_PICKUPS=0
TOTAL_RELEASES=0
TOTAL_MOVES=0
TOTAL_SHIPS=0
STALE_COUNT=0   # pickups with no move in >3 min

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Watching board for ${MINUTES} minutes (interval: ${INTERVAL}s)..."
log "Active file: $ACTIVE_FILE"
echo "---"

LAST_LOG_LEN=0

while [[ $(date +%s) -lt $END_TIME ]]; do
  if [[ ! -f "$ACTIVE_FILE" ]]; then
    sleep "$INTERVAL"
    continue
  fi

  # Read active-work.json
  ACTIVE_JSON=$(cat "$ACTIVE_FILE" 2>/dev/null || echo '{"active":[],"log":[]}')
  LOG_LEN=$(echo "$ACTIVE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('log',[])))" 2>/dev/null || echo 0)

  if [[ "$LOG_LEN" -gt "$LAST_LOG_LEN" ]]; then
    # Process new log entries
    NEW_EVENTS=$(echo "$ACTIVE_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
log = d.get('log', [])
last = int(sys.argv[1])
for ev in log[last:]:
    action = ev.get('action','?')
    card = ev.get('cardId','?')
    worker = ev.get('worker','?').replace('board-worker-','')
    col = ev.get('column','')
    at = ev.get('at','')
    print(f'{action}|{card}|{worker}|{col}|{at}')
" "$LAST_LOG_LEN" 2>/dev/null || true)

    while IFS='|' read -r action card worker col at; do
      [[ -z "$action" ]] && continue
      ts=$(date +%s)
      case "$action" in
        pickup)
          PICKUP_TIME["$card"]=$ts
          PICKUP_WORKER["$card"]=$worker
          TOTAL_PICKUPS=$((TOTAL_PICKUPS + 1))
          log "🔵 PICKUP  $card  ($worker)"
          EVENTS+=("$(date '+%H:%M:%S') pickup  $card  $worker")
          ;;
        release)
          if [[ -n "${PICKUP_TIME[$card]:-}" ]]; then
            held=$(( ts - PICKUP_TIME[$card] ))
            log "✅ RELEASE $card  ($worker) held ${held}s"
            EVENTS+=("$(date '+%H:%M:%S') release $card  ${held}s")
            if [[ $held -gt 180 ]] && [[ -z "${CARD_COLUMNS[$card]:-}" ]]; then
              log "⚠️  STALE   $card  held ${held}s with no column move"
              STALE_COUNT=$((STALE_COUNT + 1))
            fi
            unset "PICKUP_TIME[$card]"
            unset "PICKUP_WORKER[$card]"
          fi
          TOTAL_RELEASES=$((TOTAL_RELEASES + 1))
          ;;
        move)
          CARD_COLUMNS["$card"]=$col
          TOTAL_MOVES=$((TOTAL_MOVES + 1))
          log "📋 MOVE    $card  → $col  ($worker)"
          EVENTS+=("$(date '+%H:%M:%S') move    $card  → $col")
          ;;
        ship)
          TOTAL_SHIPS=$((TOTAL_SHIPS + 1))
          log "🚀 SHIP    $card  ($worker)"
          EVENTS+=("$(date '+%H:%M:%S') ship    $card")
          ;;
        create)
          log "📌 CREATE  $card"
          EVENTS+=("$(date '+%H:%M:%S') create  $card")
          ;;
      esac
    done <<< "$NEW_EVENTS"

    LAST_LOG_LEN=$LOG_LEN
  fi

  # Show currently active
  ACTIVE_COUNT=$(echo "$ACTIVE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('active',[])))" 2>/dev/null || echo 0)
  REMAINING=$(( END_TIME - $(date +%s) ))
  printf "\r[active: %d | picks: %d | moves: %d | ships: %d | stale: %d | %ds left]   " \
    "$ACTIVE_COUNT" "$TOTAL_PICKUPS" "$TOTAL_MOVES" "$TOTAL_SHIPS" "$STALE_COUNT" "$REMAINING"

  sleep "$INTERVAL"
done

echo ""
echo ""
echo "=========================================="
echo "  BOARD HEALTH REPORT — ${MINUTES} min window"
echo "=========================================="
echo ""
echo "Activity:"
echo "  Pickups:  $TOTAL_PICKUPS"
echo "  Releases: $TOTAL_RELEASES"
echo "  Moves:    $TOTAL_MOVES"
echo "  Ships:    $TOTAL_SHIPS"
echo "  Stale (>3min no move): $STALE_COUNT"
echo ""

# Throughput: moves per hour
MOVES_PER_HOUR=$(( TOTAL_MOVES * 60 / MINUTES ))
SHIPS_PER_HOUR=$(( TOTAL_SHIPS * 60 / MINUTES ))

echo "Throughput (projected/hr):"
echo "  Column moves:  $MOVES_PER_HOUR/hr"
echo "  Ships:         $SHIPS_PER_HOUR/hr"
echo ""

# Tuning assessment
echo "Tuning assessment:"
if [[ $TOTAL_PICKUPS -eq 0 ]]; then
  echo "  ❌ NO ACTIVITY — workers not running or cron not firing"
elif [[ $TOTAL_MOVES -eq 0 && $TOTAL_PICKUPS -gt 2 ]]; then
  echo "  ⚠️  Workers picking up cards but NOT moving them — likely blocked on transitions"
  echo "     Check: brain column transition rules, worker cron prompts"
elif [[ $STALE_COUNT -gt 0 && $TOTAL_MOVES -lt $((TOTAL_PICKUPS / 2)) ]]; then
  echo "  ⚠️  UNDER-TUNED — too many pickups with no progress"
  echo "     Consider: tighter cron prompts, fewer parallel workers, clearer acceptance criteria"
elif [[ $TOTAL_PICKUPS -gt 0 && $TOTAL_MOVES -ge $TOTAL_PICKUPS ]]; then
  echo "  ✅ WELL-TUNED — workers picking up and making progress"
  if [[ $TOTAL_SHIPS -gt 0 ]]; then
    echo "  ✅ SHIPPING — $TOTAL_SHIPS card(s) shipped in ${MINUTES}min"
  fi
elif [[ $TOTAL_PICKUPS -gt 0 && $TOTAL_MOVES -gt 0 ]]; then
  echo "  ✅ ACTIVE — picking up and moving cards, some stalls expected"
else
  echo "  ℹ️  Low signal — run again for a longer window"
fi

echo ""
echo "Event log:"
for e in "${EVENTS[@]}"; do
  echo "  $e"
done
