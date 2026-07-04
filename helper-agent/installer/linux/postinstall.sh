#!/bin/sh
# Enable + start the agent as a systemd user service for the installing user.
# $SUDO_USER is set when the package manager was invoked via sudo.
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
         systemctl --user daemon-reload && \
         XDG_RUNTIME_DIR=/run/user/$TUID \
         DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$TUID/bus \
         systemctl --user enable --now easy-pdf-sign-helper.service" \
        2>/dev/null || true
    fi
  else
    systemctl --user enable --now easy-pdf-sign-helper.service 2>/dev/null || true
  fi
fi
# Fallback: the xdg autostart .desktop entry starts the agent on next login
# even if the immediate start above could not run.
