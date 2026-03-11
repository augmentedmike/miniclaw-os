#!/usr/bin/env bash
#
# push-wiki.sh — Push docs/wiki/*.md pages to the GitHub wiki repo.
#
# Prerequisites:
#   1. Initialize the wiki by creating the first page at:
#      https://github.com/augmentedmike/miniclaw-os/wiki/_new
#      (just paste "Initializing..." and save — this script overwrites it)
#   2. Run this script.
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WIKI_SRC="$REPO_ROOT/docs/wiki"
WIKI_CLONE="/tmp/miniclaw-os.wiki"

echo "Cloning wiki repo..."
rm -rf "$WIKI_CLONE"
git clone git@github.com:augmentedmike/miniclaw-os.wiki.git "$WIKI_CLONE"

echo "Copying wiki pages..."
cp "$WIKI_SRC"/*.md "$WIKI_CLONE/"

cd "$WIKI_CLONE"
git add -A
git commit -m "Update wiki pages from docs/wiki/"
git push

echo "Wiki updated successfully."
echo "View at: https://github.com/augmentedmike/miniclaw-os/wiki"
