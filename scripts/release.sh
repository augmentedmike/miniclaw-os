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
#   3. Package the installer zip (.app bundle with pre-built web)
#   4. Git tag vX.Y.Z (and 'stable' if --stable)
#   5. Push tags
#   6. Create GitHub release with the zip
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
echo "Releasing miniclaw-os $TAG"

# 1. Build
echo "  Building board web..."
(cd "$BOARD_WEB" && npx next build) || { echo "Build failed"; exit 1; }
echo "  ✓ Build OK"

# 2. Package standalone
echo "  Packaging installer..."
rm -rf "$DIST"
mkdir -p "$DIST/miniclaw-web"
cp -a "$BOARD_WEB/.next/standalone/." "$DIST/miniclaw-web/"
cp -r "$BOARD_WEB/.next/static" "$DIST/miniclaw-web/.next/static"
cp -r "$BOARD_WEB/public" "$DIST/miniclaw-web/public"

APP="$DIST/Install MiniClaw.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$REPO_DIR/dist/Install MiniClaw.app/Contents/Info.plist" "$APP/Contents/Info.plist"
printf '#!/bin/bash\nexec bash "$(dirname "$0")/../../Resources/bootstrap.sh"\n' > "$APP/Contents/MacOS/install"
chmod +x "$APP/Contents/MacOS/install"
cp "$REPO_DIR/bootstrap.sh" "$APP/Contents/Resources/bootstrap.sh"
cp -a "$DIST/miniclaw-web" "$APP/Contents/Resources/miniclaw-web"

ZIP="$DIST/MiniClaw-Installer-$TAG.zip"
(cd "$DIST" && zip -r -q "$ZIP" "Install MiniClaw.app")
echo "  ✓ Packaged: $(du -h "$ZIP" | awk '{print $1}')"

# 3. Git tags
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

# 4. GitHub release
echo "  Creating GitHub release..."
RELEASE_TAG="${TAG}-installer"
gh release delete "$RELEASE_TAG" --yes --repo augmentedmike/miniclaw-os 2>/dev/null || true
gh release create "$RELEASE_TAG" \
  --title "$TAG" \
  --notes "MiniClaw $TAG" \
  --repo augmentedmike/miniclaw-os \
  "$ZIP"
echo "  ✓ Released: https://github.com/augmentedmike/miniclaw-os/releases/tag/$RELEASE_TAG"

echo ""
echo "Done: miniclaw-os $TAG"
$STABLE && echo "  Tagged as stable"
echo ""
echo "To update the install page download link:"
echo "  Update the zip URL in miniclaw-www/app/install/page.tsx"
