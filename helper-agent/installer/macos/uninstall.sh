#!/bin/sh
# Installed as /usr/local/bin/easy-pdf-sign-helper-uninstall
# Usage: sudo easy-pdf-sign-helper-uninstall
set -e

LABEL="bg.easypdfsign.helper"
PLIST="/Library/LaunchAgents/$LABEL.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "Стартирайте с sudo: sudo $0" >&2
  exit 1
fi

CONSOLE_USER="$(stat -f%Su /dev/console 2>/dev/null || echo '')"
case "$CONSOLE_USER" in
  ''|root|loginwindow) ;;
  *)
    CONSOLE_UID="$(id -u "$CONSOLE_USER")"
    launchctl bootout "gui/$CONSOLE_UID/$LABEL" 2>/dev/null ||
      launchctl unload -w "$PLIST" 2>/dev/null || true
    ;;
esac

rm -f "$PLIST"
rm -rf /usr/local/libexec/easy-pdf-sign-helper
rm -f /usr/local/bin/easy-pdf-sign-helper
pkgutil --forget "$LABEL" >/dev/null 2>&1 || true

echo "Easy PDF Sign Helper е деинсталиран."
rm -f "$0"
