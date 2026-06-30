#!/usr/bin/env bash
# Builds easy-pdf-sign-helper.deb using dpkg-deb (no Ruby/fpm needed).
# Requires: sudo dnf install dpkg  (already available on most Fedora installs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASE_DIR="$AGENT_DIR/release"
BUILD_DIR="$RELEASE_DIR/_deb"
NAME="easy-pdf-sign-helper"
VERSION="0.1.0"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/usr/local/bin"
mkdir -p "$BUILD_DIR/usr/lib/systemd/user"
mkdir -p "$BUILD_DIR/etc/xdg/autostart"

cp "$RELEASE_DIR/${NAME}-linux"      "$BUILD_DIR/usr/local/bin/$NAME"
chmod 755 "$BUILD_DIR/usr/local/bin/$NAME"
cp "$SCRIPT_DIR/${NAME}.service"     "$BUILD_DIR/usr/lib/systemd/user/"
cp "$SCRIPT_DIR/${NAME}.desktop"     "$BUILD_DIR/etc/xdg/autostart/"

cat > "$BUILD_DIR/DEBIAN/control" << EOF
Package: $NAME
Version: $VERSION
Section: misc
Priority: optional
Architecture: amd64
Maintainer: Easy PDF Sign <support@easypdf-sign.bg>
Description: Local PKCS#11 signing agent for Easy PDF Sign
 Listens on 127.0.0.1:17357. Private keys never leave the smart card.
EOF

cp "$SCRIPT_DIR/postinstall.sh"  "$BUILD_DIR/DEBIAN/postinst"
cp "$SCRIPT_DIR/preuninstall.sh" "$BUILD_DIR/DEBIAN/prerm"
chmod 755 "$BUILD_DIR/DEBIAN/postinst" "$BUILD_DIR/DEBIAN/prerm"

dpkg-deb --build --root-owner-group "$BUILD_DIR" "$RELEASE_DIR/${NAME}.deb"

rm -rf "$BUILD_DIR"
echo "Built: $RELEASE_DIR/${NAME}.deb"
