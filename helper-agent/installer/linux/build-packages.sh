#!/usr/bin/env bash
# Produces easy-pdf-sign-helper.rpm and .deb in helper-agent/release/.
# Requires: fpm (gem install --no-document fpm) and rpm (dnf/apt).
# Called automatically by 'npm run build:linux-packages'.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASE_DIR="$AGENT_DIR/release"
STAGING="$RELEASE_DIR/_staging"
VERSION="$(node -p "require('$AGENT_DIR/package.json').version")"

mkdir -p "$STAGING/usr/local/bin"
mkdir -p "$STAGING/usr/lib/systemd/user"
mkdir -p "$STAGING/etc/xdg/autostart"

cp "$RELEASE_DIR/easy-pdf-sign-helper-linux" "$STAGING/usr/local/bin/easy-pdf-sign-helper"
chmod 755 "$STAGING/usr/local/bin/easy-pdf-sign-helper"
cp "$SCRIPT_DIR/easy-pdf-sign-helper.service" "$STAGING/usr/lib/systemd/user/"
cp "$SCRIPT_DIR/easy-pdf-sign-helper.desktop" "$STAGING/etc/xdg/autostart/"

FPM_ARGS=(
  -s dir
  -n easy-pdf-sign-helper
  -v "$VERSION"
  --architecture x86_64
  --description "Local PKCS#11 signing agent for Easy PDF Sign (listens on 127.0.0.1:17357)"
  --license MIT
  --vendor "Easy PDF Sign"
  --category "Office"
  --after-install "$SCRIPT_DIR/postinstall.sh"
  --before-remove "$SCRIPT_DIR/preuninstall.sh"
  -C "$STAGING"
)

fpm "${FPM_ARGS[@]}" -t rpm -p "$RELEASE_DIR/easy-pdf-sign-helper.rpm" .
fpm "${FPM_ARGS[@]}" -t deb -p "$RELEASE_DIR/easy-pdf-sign-helper.deb" .

rm -rf "$STAGING"
echo "Built: $RELEASE_DIR/easy-pdf-sign-helper.rpm and .deb"
