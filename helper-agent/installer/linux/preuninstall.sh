#!/bin/sh
# Stop and disable the service before the binary is removed — but only on a
# real uninstall. On upgrade this script (from the OLD package) runs AFTER the
# new package's postinstall (RPM order: %post new → %preun old), so stopping
# here would kill the service the new package just started.
#   RPM passes $1 as a number: 0 = uninstall, 1+ = upgrade/reinstall.
#   DEB passes $1 as a string: "remove"/"purge" = uninstall, "upgrade" = upgrade.
case "${1:-0}" in
  0|remove|purge) ;;   # real uninstall → proceed to stop + disable
  *) exit 0 ;;         # upgrade/reinstall → leave the service running
esac

if command -v systemctl >/dev/null 2>&1; then
  TARGET="${SUDO_USER:-}"
  if [ -n "$TARGET" ]; then
    # systemctl --user needs the target user's runtime dir + session bus,
    # which a root scriptlet doesn't inherit — set them explicitly.
    TUID="$(id -u "$TARGET" 2>/dev/null)"
    if [ -n "$TUID" ] && [ -d "/run/user/$TUID" ]; then
      su -s /bin/sh "$TARGET" -c \
        "XDG_RUNTIME_DIR=/run/user/$TUID \
         DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$TUID/bus \
         systemctl --user stop easy-pdf-sign-helper.service 2>/dev/null; \
         XDG_RUNTIME_DIR=/run/user/$TUID \
         DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$TUID/bus \
         systemctl --user disable easy-pdf-sign-helper.service 2>/dev/null" \
        || true
    fi
  else
    systemctl --user stop easy-pdf-sign-helper.service 2>/dev/null || true
    systemctl --user disable easy-pdf-sign-helper.service 2>/dev/null || true
  fi
fi
