#!/usr/bin/env bash
#
# configure-power.sh — set macOS power management for always-on agent operation
#
# Usage:
#   sudo ./scripts/configure-power.sh           # apply settings
#   sudo ./scripts/configure-power.sh --check   # verify only, no changes
#
# See docs/power-management-setup.md for details.
#
set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Expected pmset key=value pairs for always-on operation
SETTINGS=(
  "sleep=0"
  "disksleep=0"
  "displaysleep=0"
  "autorestart=1"
  "powernap=0"
  "hibernatemode=0"
  "networkoversleep=1"
)

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

# Get current pmset output once
PMSET_OUTPUT=$(pmset -g)

get_current() {
  local key="$1"
  echo "$PMSET_OUTPUT" | awk -v k="$key" '$1 == k {print $2}'
}

errors=0

for entry in "${SETTINGS[@]}"; do
  key="${entry%%=*}"
  want="${entry##*=}"
  have=$(get_current "$key")
  have="${have:-(not set)}"

  if [[ "$have" == "$want" ]]; then
    printf "${GREEN}✓${NC} %-20s = %s\n" "$key" "$have"
  else
    printf "${RED}✗${NC} %-20s = %s (want %s)\n" "$key" "$have" "$want"
    ((errors++)) || true
  fi
done

if [[ "$CHECK_ONLY" == true ]]; then
  if [[ $errors -gt 0 ]]; then
    echo ""
    printf "${YELLOW}%d setting(s) need updating. Run without --check to fix.${NC}\n" "$errors"
    exit 1
  else
    echo ""
    printf "${GREEN}All power settings are correct.${NC}\n"
    exit 0
  fi
fi

if [[ $errors -eq 0 ]]; then
  echo ""
  printf "${GREEN}All power settings are already correct. Nothing to do.${NC}\n"
  exit 0
fi

# Check for sudo
if [[ $EUID -ne 0 ]]; then
  echo ""
  printf "${RED}Error: pmset requires sudo. Run: sudo %s${NC}\n" "$0"
  exit 1
fi

echo ""
echo "Applying power settings..."

for entry in "${SETTINGS[@]}"; do
  key="${entry%%=*}"
  want="${entry##*=}"
  have=$(get_current "$key")
  have="${have:-(not set)}"

  if [[ "$have" != "$want" ]]; then
    printf "  pmset -a %-20s %s\n" "$key" "$want"
    pmset -a "$key" "$want"
  fi
done

echo ""
printf "${GREEN}Done. All power settings applied.${NC}\n"
echo "Run 'pmset -g' to verify."
