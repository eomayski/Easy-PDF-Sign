#!/usr/bin/env bash
# Builds release/easy-pdf-sign-helper.pkg — a standard macOS installer package
# (double-click → Installer.app), replacing the bare Mach-O binary we used to
# publish, which browsers and Finder treated as an unknown/text file.
#
# Input: whichever of these exist (build them with build:mac-arm64 / build:mac-x64):
#   release/easy-pdf-sign-helper-macos-arm64
#   release/easy-pdf-sign-helper-macos-x64
#
# Both slices are shipped side by side under /usr/local/libexec and dispatched
# by a wrapper: a pkg-built executable carries its payload appended after the
# Mach-O, so `lipo` cannot fuse the two into one universal binary.
#
# Layout installed on the target Mac:
#   /usr/local/libexec/easy-pdf-sign-helper/easy-pdf-sign-helper-{arm64,x64}
#   /usr/local/bin/easy-pdf-sign-helper              (arch dispatch wrapper)
#   /usr/local/bin/easy-pdf-sign-helper-uninstall
#   /Library/LaunchAgents/bg.easypdfsign.helper.plist
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASE_DIR="$AGENT_DIR/release"
BUILD_DIR="$RELEASE_DIR/_pkg"
ROOT="$BUILD_DIR/root"
IDENTIFIER="bg.easypdfsign.helper"
VERSION="$(node -p "require('$AGENT_DIR/package.json').version")"

rm -rf "$BUILD_DIR"
mkdir -p "$ROOT/usr/local/libexec/easy-pdf-sign-helper"
mkdir -p "$ROOT/usr/local/bin"
mkdir -p "$ROOT/Library/LaunchAgents"
mkdir -p "$BUILD_DIR/scripts"

# ─── payload: the architecture slices ────────────────────────────────────────
# lipo -archs guards against the trap this build had before: a binary targeted
# at one arch while the bundled pkcs11.node was compiled for the other.
add_slice() {
  local name="$1" expected="$2"
  local src="$RELEASE_DIR/easy-pdf-sign-helper-macos-$name"
  [ -f "$src" ] || return 1

  local archs
  archs="$(lipo -archs "$src" 2>/dev/null || echo 'unknown')"
  if [ "$archs" != "$expected" ]; then
    echo "ERROR: $src is '$archs', expected '$expected'." >&2
    echo "       Build each slice on a host of that architecture — the bundled" >&2
    echo "       pkcs11 native addon cannot be cross-compiled." >&2
    exit 1
  fi

  local dest="$ROOT/usr/local/libexec/easy-pdf-sign-helper/easy-pdf-sign-helper-$name"
  cp "$src" "$dest"
  chmod 755 "$dest"

  # arm64 macOS refuses to exec an unsigned binary; pkg normally ad-hoc signs
  # its arm64 output, so this only kicks in if that did not happen.
  # set -e does not apply inside a function used as a condition, hence the
  # explicit exit.
  if ! codesign -dv "$dest" >/dev/null 2>&1; then
    echo "  (ad-hoc signing $name slice)"
    codesign --force --sign - "$dest" || { echo "ERROR: codesign failed for $name" >&2; exit 1; }
  fi
  echo "  + $name ($archs)"
}

echo "Collecting slices:"
HAVE_SLICE=0
add_slice arm64 arm64   && HAVE_SLICE=1
add_slice x64   x86_64  && HAVE_SLICE=1
if [ "$HAVE_SLICE" -eq 0 ]; then
  echo "ERROR: no binaries found in $RELEASE_DIR — run build:mac-arm64 / build:mac-x64 first." >&2
  exit 1
fi

# ─── payload: wrapper, uninstaller, LaunchAgent ──────────────────────────────
cp "$SCRIPT_DIR/launcher.sh"   "$ROOT/usr/local/bin/easy-pdf-sign-helper"
cp "$SCRIPT_DIR/uninstall.sh"  "$ROOT/usr/local/bin/easy-pdf-sign-helper-uninstall"
chmod 755 "$ROOT/usr/local/bin/easy-pdf-sign-helper" \
          "$ROOT/usr/local/bin/easy-pdf-sign-helper-uninstall"
cp "$SCRIPT_DIR/$IDENTIFIER.plist" "$ROOT/Library/LaunchAgents/"
chmod 644 "$ROOT/Library/LaunchAgents/$IDENTIFIER.plist"

# Copied + chmod'ed here rather than run from the repo, so the build does not
# depend on the exec bit surviving a checkout (Windows clones drop it).
cp "$SCRIPT_DIR/scripts/preinstall" "$SCRIPT_DIR/scripts/postinstall" "$BUILD_DIR/scripts/"
chmod 755 "$BUILD_DIR/scripts/preinstall" "$BUILD_DIR/scripts/postinstall"

# ─── component package ───────────────────────────────────────────────────────
pkgbuild \
  --root "$ROOT" \
  --scripts "$BUILD_DIR/scripts" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --ownership recommended \
  --install-location / \
  "$BUILD_DIR/component.pkg"

# ─── distribution (welcome/conclusion screens, OS + arch checks) ─────────────
sed "s/@VERSION@/$VERSION/g" "$SCRIPT_DIR/distribution.xml" > "$BUILD_DIR/distribution.xml"

productbuild \
  --distribution "$BUILD_DIR/distribution.xml" \
  --resources "$SCRIPT_DIR/resources" \
  --package-path "$BUILD_DIR" \
  "$RELEASE_DIR/easy-pdf-sign-helper.pkg"

rm -rf "$BUILD_DIR"
echo "Built: $RELEASE_DIR/easy-pdf-sign-helper.pkg (v$VERSION)"
echo "NOTE: unsigned — Gatekeeper asks the user to confirm on first open."
