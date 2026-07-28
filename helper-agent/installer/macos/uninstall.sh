#!/bin/sh
# Installed as /usr/local/bin/easy-pdf-sign-helper-uninstall
# Usage: sudo easy-pdf-sign-helper-uninstall
set -e

LABEL="bg.easypdfsign.helper"
PLIST="/Library/LaunchAgents/$LABEL.plist"
CA_NAME="Easy PDF Sign Local CA"

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

    # Drop the admin trust setting while the certificate file still exists —
    # remove-trusted-cert needs it. Only then delete the material.
    USER_HOME="$(eval echo "~$CONSOLE_USER")"
    CA_PATH="$USER_HOME/Library/Application Support/EasyPDFSign/tls/ca.pem"
    [ -f "$CA_PATH" ] && security remove-trusted-cert -d "$CA_PATH" 2>/dev/null
    rm -rf "$USER_HOME/Library/Application Support/EasyPDFSign"
    ;;
esac

# A trusted root left behind would be the one genuinely harmful leftover of this
# installer, so it goes even if everything above failed. Repeated installs can
# leave more than one copy; the counter keeps a misbehaving `security` from
# spinning here forever.
i=0
while [ "$i" -lt 10 ] && security delete-certificate -c "$CA_NAME" -t \
        /Library/Keychains/System.keychain >/dev/null 2>&1; do
  echo "Премахнат локален сертификат от System keychain."
  i=$((i + 1))
done

rm -f "$PLIST"
rm -rf /usr/local/libexec/easy-pdf-sign-helper
rm -f /usr/local/bin/easy-pdf-sign-helper
pkgutil --forget "$LABEL" >/dev/null 2>&1 || true

echo "Easy PDF Sign Helper е деинсталиран."
rm -f "$0"
