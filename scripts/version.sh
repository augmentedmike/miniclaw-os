#!/usr/bin/env bash
# version.sh — bump miniclaw-os version
#
# Usage:
#   ./scripts/version.sh --patch   # 0.1.5 → 0.1.6
#   ./scripts/version.sh --minor   # 0.1.5 → 0.2.0
#   ./scripts/version.sh --major   # 0.1.5 → 1.0.0

set -euo pipefail

MANIFEST="$(cd "$(dirname "$0")/.." && pwd)/MANIFEST.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: MANIFEST.json not found at $MANIFEST"
  exit 1
fi

CURRENT=$(python3 -c "import json; print(json.load(open('$MANIFEST'))['version'])")

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "${1:-}" in
  --patch) PATCH=$((PATCH + 1)) ;;
  --minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  --major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *)
    echo "Usage: $0 --patch | --minor | --major"
    echo "Current version: $CURRENT"
    exit 1
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"

python3 -c "
import json
with open('$MANIFEST') as f: m = json.load(f)
m['version'] = '$NEW'
with open('$MANIFEST', 'w') as f: json.dump(m, f, indent=2); f.write('\n')
"

echo "$CURRENT → $NEW"
