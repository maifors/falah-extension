#!/usr/bin/env bash
# Falah OS — Chrome Web Store Packaging Script
# Run: bash build-cws.sh
# Produces: dist/falah-os-v2.2.0.zip

set -euo pipefail

NAME="falah-os"
VERSION="2.2.0"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"

echo "==> Falah OS CWS Build v$VERSION"
echo "==> Cleaning dist/ ..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "==> Copying extension files ..."
cd "$ROOT_DIR"

# Directories to include
mkdir -p "$DIST_DIR/src"
mkdir -p "$DIST_DIR/icons"
mkdir -p "$DIST_DIR/rules"
mkdir -p "$DIST_DIR/_locales"
mkdir -p "$DIST_DIR/src/background"
mkdir -p "$DIST_DIR/src/content"
mkdir -p "$DIST_DIR/src/panel"
mkdir -p "$DIST_DIR/src/pages"
mkdir -p "$DIST_DIR/src/popup"

# Copy all source files
cp manifest.json "$DIST_DIR/"
cp -r icons/* "$DIST_DIR/icons/"
cp -r rules/* "$DIST_DIR/rules/"
cp -r _locales/* "$DIST_DIR/_locales/"
cp -r src/background/*.js "$DIST_DIR/src/background/"
cp -r src/content/* "$DIST_DIR/src/content/"
cp -r src/panel/* "$DIST_DIR/src/panel/"
cp -r src/pages/* "$DIST_DIR/src/pages/"
cp -r src/popup/* "$DIST_DIR/src/popup/"

echo "==> Creating ZIP package ..."
cd "$DIST_DIR"
zip -r "${NAME}-v${VERSION}.zip" . \
  -x "*.git*" -x "*.DS_Store" -x "*node_modules*" -x "*.md" -x "*.gitignore"

echo ""
echo "==========================================="
echo "✅ CWS Package created:"
echo "   $DIST_DIR/${NAME}-v${VERSION}.zip"
echo "   Size: $(du -h "$DIST_DIR/${NAME}-v${VERSION}.zip" | cut -f1)"
echo "==========================================="

# List contents
unzip -l "$DIST_DIR/${NAME}-v${VERSION}.zip" | head -40
