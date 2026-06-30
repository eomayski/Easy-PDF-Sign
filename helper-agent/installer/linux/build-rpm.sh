#!/usr/bin/env bash
# Builds easy-pdf-sign-helper.rpm using rpmbuild (native Fedora/RHEL tooling).
# Requires: sudo dnf install rpm-build
# No Ruby/fpm needed — use this script for local Fedora development.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASE_DIR="$AGENT_DIR/release"
RPMBUILD_DIR="$HOME/rpmbuild"
NAME="easy-pdf-sign-helper"

mkdir -p "$RPMBUILD_DIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

cp "$RELEASE_DIR/${NAME}-linux"      "$RPMBUILD_DIR/SOURCES/$NAME"
chmod 755 "$RPMBUILD_DIR/SOURCES/$NAME"
cp "$SCRIPT_DIR/${NAME}.service"     "$RPMBUILD_DIR/SOURCES/"
cp "$SCRIPT_DIR/${NAME}.desktop"     "$RPMBUILD_DIR/SOURCES/"
cp "$SCRIPT_DIR/${NAME}.spec"        "$RPMBUILD_DIR/SPECS/"

rpmbuild -bb "$RPMBUILD_DIR/SPECS/${NAME}.spec"

find "$RPMBUILD_DIR/RPMS/x86_64" -name "${NAME}-*.rpm" \
  -exec cp {} "$RELEASE_DIR/${NAME}.rpm" \;

echo "Built: $RELEASE_DIR/${NAME}.rpm"
