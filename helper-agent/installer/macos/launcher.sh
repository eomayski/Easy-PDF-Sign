#!/bin/sh
# /usr/local/bin/easy-pdf-sign-helper
#
# The .pkg ships both architecture slices as separate binaries (a pkg-built
# executable carries an appended payload, so `lipo` cannot merge them into one
# universal file). This wrapper execs the one matching the host.
set -e

LIBEXEC="/usr/local/libexec/easy-pdf-sign-helper"
LOG="$HOME/Library/Logs/easy-pdf-sign-helper.log"

case "$(uname -m)" in
  arm64) BIN="$LIBEXEC/easy-pdf-sign-helper-arm64" ;;
  *)     BIN="$LIBEXEC/easy-pdf-sign-helper-x64" ;;
esac

# Apple Silicon without an arm64 slice → fall back to x86_64 under Rosetta.
[ -x "$BIN" ] || BIN="$LIBEXEC/easy-pdf-sign-helper-x64"

# Under launchd there is nowhere for the output to go, and without it there is
# no way to tell "never started" from "started and crashed". Keep the terminal
# case untouched, so running this by hand to debug still prints to the screen.
# `--init-tls` prints the CA path for the installer to consume, so its output
# must never be swallowed by the log.
#
# The writability probe matters: a failing `exec` redirection kills a
# non-interactive shell outright, and losing the log must never cost us the
# agent itself.
if [ "${1:-}" != "--init-tls" ] && [ ! -t 1 ] && [ -n "${HOME:-}" ]; then
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
  if : >> "$LOG" 2>/dev/null; then
    exec >> "$LOG" 2>&1
  fi
fi

echo "--- $(date '+%Y-%m-%d %H:%M:%S') starting on $(uname -m) → $BIN"

if [ ! -x "$BIN" ]; then
  echo "easy-pdf-sign-helper: no binary for $(uname -m) in $LIBEXEC" >&2
  exit 1
fi

exec "$BIN" "$@"
