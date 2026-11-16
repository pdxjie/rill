#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP="src-tauri/target/release/bundle/macos/Rill.app"
VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"
RELEASE_DIR="$ROOT/release"
STAGE="$ROOT/.dmg-stage"

pnpm app:build

mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR/Rill.app"
ditto --norsrc --noextattr "$APP" "$RELEASE_DIR/Rill.app"

rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto --norsrc --noextattr "$APP" "$STAGE/Rill.app"
ln -s /Applications "$STAGE/Applications"

DMG="$RELEASE_DIR/Rill-${VERSION}-${ARCH}.dmg"
rm -f "$DMG"
hdiutil create -quiet -volname "Rill" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

echo ""
echo "App: $RELEASE_DIR/Rill.app"
echo "DMG: $DMG"
echo "Size: $(du -h "$DMG" | cut -f1)"
