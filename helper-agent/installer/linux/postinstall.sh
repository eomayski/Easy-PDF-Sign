#!/bin/sh
# Enable + start the agent as a systemd user service for the installing user.
# $SUDO_USER is set when the package manager was invoked via sudo.
if command -v systemctl >/dev/null 2>&1; then
  TARGET="${SUDO_USER:-}"
  if [ -n "$TARGET" ]; then
    su -s /bin/sh "$TARGET" -c \
      "systemctl --user enable --now easy-pdf-sign-helper.service 2>/dev/null || true"
  else
    systemctl --user enable --now easy-pdf-sign-helper.service 2>/dev/null || true
  fi
fi
