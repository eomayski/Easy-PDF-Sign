#!/bin/sh
# Stop and disable the service before the binary is removed.
if command -v systemctl >/dev/null 2>&1; then
  TARGET="${SUDO_USER:-}"
  if [ -n "$TARGET" ]; then
    su -s /bin/sh "$TARGET" -c \
      "systemctl --user stop easy-pdf-sign-helper.service 2>/dev/null || true; \
       systemctl --user disable easy-pdf-sign-helper.service 2>/dev/null || true"
  else
    systemctl --user stop easy-pdf-sign-helper.service 2>/dev/null || true
    systemctl --user disable easy-pdf-sign-helper.service 2>/dev/null || true
  fi
fi
