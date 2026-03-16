#!/usr/bin/env bash
#
# check-power-settings.sh — healthcheck for macOS power management drift
#
# Verifies that pmset values match the always-on agent requirements.
# Exits 0 if all settings are correct, 1 if any have drifted.
#
# Complements mc-smoke checks for disksleep and autorestart by covering
# the full set of power settings.
#
# Usage:
#   ./cron/scripts/check-power-settings.sh
#
# Designed to run as a daily cron job:
#   0 6 * * * /path/to/check-power-settings.sh >> /tmp/power-healthcheck.log 2>&1
#
set -eo pipefail

# Expected key=value pairs
SETTINGS=(
  "sleep=0"
  "disksleep=0"
  "displaysleep=0"
  "autorestart=1"
  "powernap=0"
  "hibernatemode=0"
  "networkoversleep=1"
)

# Get current pmset output once
PMSET_OUTPUT=$(pmset -g)

get_current() {
  local key="$1"
  echo "$PMSET_OUTPUT" | awk -v k="$key" '$1 == k {print $2}'
}

errors=0
drifted=""

for entry in "${SETTINGS[@]}"; do
  key="${entry%%=*}"
  want="${entry##*=}"
  have=$(get_current "$key")
  have="${have:-(not set)}"

  if [[ "$have" != "$want" ]]; then
    drifted="${drifted}  ${key}: ${have} (expected ${want})\n"
    ((errors++)) || true
  fi
done

timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ $errors -gt 0 ]]; then
  echo "${timestamp} DRIFT DETECTED — ${errors} power setting(s) out of spec:"
  printf "$drifted"
  echo "Fix with: sudo scripts/configure-power.sh"
  exit 1
else
  echo "${timestamp} OK — all power settings match expected values"
  exit 0
fi
