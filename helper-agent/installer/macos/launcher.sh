#!/bin/sh
# /usr/local/bin/easy-pdf-sign-helper
#
# The .pkg ships both architecture slices as separate binaries (a pkg-built
# executable carries an appended payload, so `lipo` cannot merge them into one
# universal file). This wrapper execs the one matching the host.
set -e

LIBEXEC="/usr/local/libexec/easy-pdf-sign-helper"

case "$(uname -m)" in
  arm64) BIN="$LIBEXEC/easy-pdf-sign-helper-arm64" ;;
  *)     BIN="$LIBEXEC/easy-pdf-sign-helper-x64" ;;
esac

# Apple Silicon without an arm64 slice → fall back to x86_64 under Rosetta.
[ -x "$BIN" ] || BIN="$LIBEXEC/easy-pdf-sign-helper-x64"

if [ ! -x "$BIN" ]; then
  echo "easy-pdf-sign-helper: no binary for $(uname -m) in $LIBEXEC" >&2
  exit 1
fi

exec "$BIN" "$@"
