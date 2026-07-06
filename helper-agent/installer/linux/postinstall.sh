#!/bin/sh
# Enable + (re)start the agent as a systemd user service.
# 'restart' (not 'enable --now') so an already-running old binary is
# replaced by the freshly installed one on upgrade.
#
# The scriptlet runs as root. Two install paths must work:
#  - 'sudo dnf/apt' from a terminal → $SUDO_USER identifies the user
#  - GUI installs (KDE Discover / GNOME Software via PackageKit) → the
#    PackageKit daemon sets no SUDO_USER, so target every user with an
#    active session (/run/user/<uid>)
command -v systemctl >/dev/null 2>&1 || exit 0

# systemctl --user needs the target user's runtime dir + session bus,
# which a root scriptlet doesn't inherit — set them explicitly.
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
  user_systemctl "$_uid" "$_user" daemon-reload
  user_systemctl "$_uid" "$_user" enable easy-pdf-sign-helper.service
  user_systemctl "$_uid" "$_user" restart easy-pdf-sign-helper.service
done

# Fallback: the xdg autostart .desktop entry starts the agent on next login
# even if the immediate start above could not run.
