Name:           easy-pdf-sign-helper
Version:        0.1.0
Release:        1%{?dist}
Summary:        Local PKCS#11 signing agent for Easy PDF Sign
License:        MIT
BuildArch:      x86_64

%define debug_package %{nil}
# pkg appends the Node.js snapshot after the ELF sections — brp-strip would
# destroy it. Tell rpmbuild to leave all binaries untouched.
%define __strip /bin/true
%define __objdump /bin/true

%description
Local background agent that bridges the Easy PDF Sign web application
to PKCS#11 smart cards. Listens on 127.0.0.1:17357; private keys
never leave the card.

%install
install -Dm755 %{_sourcedir}/easy-pdf-sign-helper \
    %{buildroot}/usr/local/bin/easy-pdf-sign-helper
install -Dm644 %{_sourcedir}/easy-pdf-sign-helper.service \
    %{buildroot}/usr/lib/systemd/user/easy-pdf-sign-helper.service
install -Dm644 %{_sourcedir}/easy-pdf-sign-helper.desktop \
    %{buildroot}/etc/xdg/autostart/easy-pdf-sign-helper.desktop

%files
/usr/local/bin/easy-pdf-sign-helper
/usr/lib/systemd/user/easy-pdf-sign-helper.service
/etc/xdg/autostart/easy-pdf-sign-helper.desktop

%post
if command -v systemctl >/dev/null 2>&1 && [ -n "${SUDO_USER:-}" ]; then
  su -s /bin/sh "$SUDO_USER" \
    -c "systemctl --user enable easy-pdf-sign-helper.service 2>/dev/null" || true
fi

%preun
if [ $1 -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
  su -s /bin/sh "$SUDO_USER" \
    -c "systemctl --user stop easy-pdf-sign-helper.service 2>/dev/null; \
        systemctl --user disable easy-pdf-sign-helper.service 2>/dev/null" || true
fi

%changelog
* Tue Jul 01 2026 Easy PDF Sign <support@easypdf-sign.bg> - 0.1.0-1
- Initial release
