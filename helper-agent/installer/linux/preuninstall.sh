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

command -v systemctl >/dev/null 2>&1 || exit 0

# Same user-resolution logic as postinstall.sh: $SUDO_USER for terminal
# installs, every active session (/run/user/<uid>) for PackageKit/Discover.
user_systemctl() {
  _uid="$1"; _user="$2"; shift 2
  su -s /bin/sh "$_user" -c \
    "XDG_RUNTIME_DIR=/run/user/$_uid \
     DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$_uid/bus \
     systemctl --user $*" 2>/dev/null || true
}

if [ -n "${SUDO_USER:-}" ]; then
  UIDS="$(id -u "$SUDO_USER" 2>/dev/null)"
else
  UIDS=""
  for _d in /run/user/*; do
    [ -d "$_d" ] && UIDS="$UIDS ${_d##*/}"
  done
fi

for _uid in $UIDS; do
  [ "$_uid" -ge 1000 ] 2>/dev/null || continue   # skip system users (gdm, sddm…)
  [ -d "/run/user/$_uid" ] || continue
  _user="$(id -nu "$_uid" 2>/dev/null)" || continue
  user_systemctl "$_uid" "$_user" stop easy-pdf-sign-helper.service
  user_systemctl "$_uid" "$_user" disable easy-pdf-sign-helper.service
done
