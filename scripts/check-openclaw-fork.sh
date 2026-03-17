#!/usr/bin/env bash
# check-openclaw-fork.sh — Postinstall check: warn if the local openclaw fork is missing.
# Plugins use file: references to resolve openclaw from the local fork instead of npm.
# Without the fork directory, npm install will fail for any plugin with this dependency.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# The fork should be a sibling directory of this repo under projects/
FORK_PATH="$(cd "$REPO_ROOT/.." && pwd)/openclaw"

if [ ! -d "$FORK_PATH" ]; then
  echo ""
  echo "⚠️  WARNING: Local openclaw fork not found at $FORK_PATH"
  echo ""
  echo "MiniClaw plugins use file: references to resolve openclaw from a local fork."
  echo "Without it, npm install will fail for plugins that depend on openclaw."
  echo ""
  echo "To fix this, clone the fork:"
  echo "  git clone https://github.com/augmentedmike/openclaw.git $FORK_PATH"
  echo ""
  exit 1
fi

if [ ! -f "$FORK_PATH/package.json" ]; then
  echo ""
  echo "⚠️  WARNING: openclaw fork at $FORK_PATH exists but has no package.json"
  echo "The fork directory may be incomplete. Try re-cloning:"
  echo "  rm -rf $FORK_PATH && git clone https://github.com/augmentedmike/openclaw.git $FORK_PATH"
  echo ""
  exit 1
fi

echo "✓ openclaw fork found at $FORK_PATH"
