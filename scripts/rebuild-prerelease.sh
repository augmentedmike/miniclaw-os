#!/usr/bin/env bash
# rebuild-prerelease.sh — clean, rebuild, retag, rerelease v0.1.8-prerelease
#
# Usage: ./scripts/rebuild-prerelease.sh
#
# Does:
#   1. Hard-delete ~/.openclaw (fresh slate)
#   2. Pull latest main
#   3. Build board web app
#   4. Pre-build all plugins (shared node_modules)
#   5. Package installer zip
#   6. Force-update v0.1.8-prerelease tag
#   7. Delete old GitHub release, create new one with fresh zip
#   8. Run bootstrap.sh to test
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOARD_WEB="$REPO_DIR/plugins/mc-board/web"
DIST="/tmp/miniclaw-installer-build"
TAG="v0.1.8-prerelease"
VERSION="0.1.8-prerelease"

echo "=== MiniClaw Prerelease Rebuild ==="
echo ""

# 1. Clean
echo "[1/8] Cleaning..."
if [[ -d "$HOME/.openclaw" ]]; then
  launchctl unload ~/Library/LaunchAgents/com.miniclaw.* 2>/dev/null || true
  launchctl unload ~/Library/LaunchAgents/ai.openclaw.* 2>/dev/null || true
  for port in 4210 4220; do
    lsof -ti ":$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  pkill -f "openclaw gateway" 2>/dev/null || true
  rm -f ~/Library/LaunchAgents/com.miniclaw.* ~/Library/LaunchAgents/ai.openclaw.*
  rm -rf "$HOME/.openclaw"
  echo "  Deleted ~/.openclaw"
fi
# Clean stale crontab entries
if crontab -l 2>/dev/null | grep -q 'openclaw\|miniclaw'; then
  crontab -l 2>/dev/null | grep -v 'openclaw\|miniclaw' | crontab -
  echo "  Cleaned stale crontab entries"
fi
echo "  ✓ Clean"

# 2. Pull
echo "[2/8] Pulling latest main..."
git -C "$REPO_DIR" clean -fd
git -C "$REPO_DIR" checkout -- .
git -C "$REPO_DIR" checkout main
git -C "$REPO_DIR" pull --rebase origin main
echo "  ✓ Up to date"

# 3. Build web
echo "[3/8] Building board web..."
(cd "$BOARD_WEB" && node node_modules/next/dist/bin/next build 2>&1 | tail -3) \
  || (cd "$BOARD_WEB" && npx next build 2>&1 | tail -3)
echo "  ✓ Build OK"

# 4. Pre-build plugins
echo "[4/8] Pre-building plugins..."
PLUGINS_PREBUILT="$REPO_DIR/.plugins-prebuilt"
rm -rf "$PLUGINS_PREBUILT"
mkdir -p "$PLUGINS_PREBUILT"

for plugin_src in "$REPO_DIR/plugins"/mc-*/; do
  plugin_name="$(basename "$plugin_src")"
  dest="$PLUGINS_PREBUILT/$plugin_name"
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='web' "$plugin_src" "$dest/"
done

# Merge shared deps
python3 - "$PLUGINS_PREBUILT" <<'MERGEPY'
import json, sys, os, glob
root = sys.argv[1]
merged = {}
for pkg_path in sorted(glob.glob(os.path.join(root, "mc-*", "package.json"))):
    with open(pkg_path) as f:
        pkg = json.load(f)
    for dep, ver in pkg.get("dependencies", {}).items():
        if dep not in merged or merged[dep] == "*":
            merged[dep] = ver
shared = {"name": "miniclaw-extensions", "version": "0.0.0", "private": True, "dependencies": merged}
with open(os.path.join(root, "package.json"), "w") as f:
    json.dump(shared, f, indent=2)
    f.write("\n")
print(f"  {len(merged)} shared dependencies")
MERGEPY

(cd "$PLUGINS_PREBUILT" && npm install --omit=dev 2>&1 | tail -3)
PLUGIN_COUNT=$(ls -d "$PLUGINS_PREBUILT"/mc-* 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ $PLUGIN_COUNT plugins pre-built"

# 5. Package
echo "[5/8] Packaging installer..."
rm -rf "$DIST"
mkdir -p "$DIST/miniclaw-web"
cp -a "$BOARD_WEB/.next/standalone/." "$DIST/miniclaw-web/"
cp -r "$BOARD_WEB/.next/static" "$DIST/miniclaw-web/.next/static"
cp -r "$BOARD_WEB/public" "$DIST/miniclaw-web/public"

APP="$DIST/miniclaw-installer.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$REPO_DIR/dist/miniclaw-installer.app/Contents/Info.plist" "$APP/Contents/Info.plist"
printf '#!/bin/bash\nexec bash "$(dirname "$0")/../../Resources/bootstrap.sh"\n' > "$APP/Contents/MacOS/install"
chmod +x "$APP/Contents/MacOS/install"
cp "$REPO_DIR/bootstrap.sh" "$APP/Contents/Resources/bootstrap.sh"

NODE_MAJOR="$(node --version | tr -d 'v' | cut -d. -f1)"
echo "$NODE_MAJOR" > "$APP/Contents/Resources/.node-version"

cp -a "$DIST/miniclaw-web" "$APP/Contents/Resources/miniclaw-web"
cp -a "$PLUGINS_PREBUILT" "$APP/Contents/Resources/plugins-prebuilt"

if [[ -d "$REPO_DIR/workspace" ]]; then
  cp -r "$REPO_DIR/workspace" "$APP/Contents/Resources/workspace"
fi

ZIP="$DIST/MiniClaw-Installer-$TAG.zip"
(cd "$DIST" && zip -r -q "$ZIP" "miniclaw-installer.app")
rm -rf "$PLUGINS_PREBUILT"
echo "  ✓ Packaged: $(du -h "$ZIP" | awk '{print $1}')"

# 6. Tag
echo "[6/8] Tagging $TAG..."
git -C "$REPO_DIR" tag -f "$TAG"
git -C "$REPO_DIR" push origin "$TAG" --force
echo "  ✓ Tag pushed"

# 7. GitHub release
echo "[7/8] Creating GitHub release..."
gh release delete "$TAG" --yes --repo augmentedmike/miniclaw-os 2>/dev/null || true
gh release create "$TAG" \
  --title "$TAG" \
  --notes "MiniClaw $TAG — prerelease candidate" \
  --repo augmentedmike/miniclaw-os \
  --prerelease \
  "$ZIP"
echo "  ✓ Released"

# 8. Install
echo "[8/8] Running bootstrap..."
echo ""
bash "$REPO_DIR/bootstrap.sh"
