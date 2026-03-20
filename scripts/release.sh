#!/usr/bin/env bash
# release.sh — build, tag, and release miniclaw-os
#
# Usage:
#   ./scripts/release.sh              # release current version
#   ./scripts/release.sh --stable     # also tag as 'stable'
#
# Steps:
#   1. Read version from MANIFEST.json
#   2. Build the board web app (Next.js standalone)
#   3. Pre-build plugins (install deps, compile native modules)
#   4. Package the installer zip (.app bundle with pre-built web + plugins)
#   5. Git tag vX.Y.Z (and 'stable' if --stable)
#   6. Push tags
#   7. Create GitHub release with the zip
#
# Prerequisites:
#   - gh CLI authenticated
#   - npm authenticated (for openclaw fork publish)
#   - Clean working tree recommended

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOARD_WEB="$REPO_DIR/plugins/mc-board/web"
DIST="/tmp/miniclaw-installer-build"

STABLE=false
[[ "${1:-}" == "--stable" ]] && STABLE=true

# Read version
VERSION=$(python3 -c "import json; print(json.load(open('$REPO_DIR/MANIFEST.json'))['version'])")
TAG="v$VERSION"
NODE_VER="$(node --version)"
NODE_MAJOR="$(echo "$NODE_VER" | tr -d 'v' | cut -d. -f1)"
echo "Releasing miniclaw-os $TAG (Node $NODE_VER)"

# Record the Node version used to build — install.sh will enforce this
echo "$NODE_MAJOR" > "$REPO_DIR/.node-version"

# 1. Build
echo "  Building board web..."
(cd "$BOARD_WEB" && npx next build) || { echo "Build failed"; exit 1; }
echo "  ✓ Build OK"

# 2. Pre-build plugins (merge deps, install once, copy source)
echo "  Pre-building plugins..."
PLUGINS_PREBUILT="$REPO_DIR/.plugins-prebuilt"
rm -rf "$PLUGINS_PREBUILT"
mkdir -p "$PLUGINS_PREBUILT"

# Copy each plugin's source (no node_modules, no web/)
for plugin_src in "$REPO_DIR/plugins"/mc-*/; do
  plugin_name="$(basename "$plugin_src")"
  dest="$PLUGINS_PREBUILT/$plugin_name"
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='web' "$plugin_src" "$dest/"
  echo "    ✓ $plugin_name"
done

# Merge ALL plugin dependencies into one shared package.json at the root.
# Node resolves modules by walking up — plugins in extensions/mc-*/ will
# find deps in extensions/node_modules/ automatically.
echo "  Merging shared dependencies..."
python3 - "$PLUGINS_PREBUILT" <<'MERGEPY'
import json, sys, os, glob

root = sys.argv[1]
merged = {}
for pkg_path in sorted(glob.glob(os.path.join(root, "mc-*", "package.json"))):
    with open(pkg_path) as f:
        pkg = json.load(f)
    for dep, ver in pkg.get("dependencies", {}).items():
        # Keep the most specific version (non-wildcard wins)
        if dep not in merged or merged[dep] == "*":
            merged[dep] = ver

shared = {
    "name": "miniclaw-extensions",
    "version": "0.0.0",
    "private": True,
    "dependencies": merged
}
with open(os.path.join(root, "package.json"), "w") as f:
    json.dump(shared, f, indent=2)
    f.write("\n")
print(f"    {len(merged)} shared dependencies")
MERGEPY

# Single npm install at the root — all plugins share one node_modules
echo "  Installing shared dependencies..."
(cd "$PLUGINS_PREBUILT" && npm install --omit=dev 2>&1 | tail -3)
echo "  ✓ $(ls "$PLUGINS_PREBUILT" | wc -l | tr -d ' ') plugins pre-built (shared node_modules)"

# 3. Package web app
echo "  Packaging installer..."
rm -rf "$DIST"
mkdir -p "$DIST/miniclaw-web"
cp -a "$BOARD_WEB/.next" "$DIST/miniclaw-web/.next"
cp -r "$BOARD_WEB/public" "$DIST/miniclaw-web/public"
cp "$BOARD_WEB/package.json" "$DIST/miniclaw-web/package.json"
cp "$BOARD_WEB/next.config.ts" "$DIST/miniclaw-web/next.config.ts"

APP="$DIST/miniclaw-installer.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$REPO_DIR/dist/miniclaw-installer.app/Contents/Info.plist" "$APP/Contents/Info.plist"
printf '#!/bin/bash\nexec bash "$(dirname "$0")/../../Resources/bootstrap.sh"\n' > "$APP/Contents/MacOS/install"
chmod +x "$APP/Contents/MacOS/install"
cp "$REPO_DIR/bootstrap.sh" "$APP/Contents/Resources/bootstrap.sh"
cp "$REPO_DIR/.node-version" "$APP/Contents/Resources/.node-version"
cp -a "$DIST/miniclaw-web" "$APP/Contents/Resources/miniclaw-web"
cp -a "$PLUGINS_PREBUILT" "$APP/Contents/Resources/plugins-prebuilt"

# Bundle workspace templates so bootstrap.sh can stage them before install.sh runs
if [[ -d "$REPO_DIR/workspace" ]]; then
  cp -r "$REPO_DIR/workspace" "$APP/Contents/Resources/workspace"
  echo "  ✓ Workspace templates bundled ($(find "$REPO_DIR/workspace" -name '*.md' | wc -l | tr -d ' ') files)"
else
  echo "  ⚠ workspace/ not found in repo — skipping template bundle"
fi

ZIP="$DIST/MiniClaw-Installer-$TAG.zip"
(cd "$DIST" && zip -r -q "$ZIP" "miniclaw-installer.app")
echo "  ✓ Packaged: $(du -h "$ZIP" | awk '{print $1}')"

# Clean up prebuilt staging
rm -rf "$PLUGINS_PREBUILT"

# 4. Git tags
echo "  Tagging $TAG..."
git -C "$REPO_DIR" tag -f "$TAG"
TAGS="$TAG"

if $STABLE; then
  echo "  Tagging stable..."
  git -C "$REPO_DIR" tag -f stable
  TAGS="$TAG stable"
fi

git -C "$REPO_DIR" push origin $TAGS --force
echo "  ✓ Tags pushed"

# 5. GitHub release
echo "  Creating GitHub release..."
gh release delete "$TAG" --yes --repo augmentedmike/miniclaw-os 2>/dev/null || true
gh release create "$TAG" \
  --title "$TAG" \
  --notes "MiniClaw $TAG" \
  --repo augmentedmike/miniclaw-os \
  "$ZIP"
echo "  ✓ Released: https://github.com/augmentedmike/miniclaw-os/releases/tag/$TAG"

echo ""
echo "Done: miniclaw-os $TAG"
$STABLE && echo "  Tagged as stable"
echo ""
echo "To update the install page download link:"
echo "  Update the zip URL in miniclaw-www/app/install/page.tsx"
