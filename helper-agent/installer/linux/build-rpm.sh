#!/usr/bin/env bash
# Builds easy-pdf-sign-helper.rpm using rpmbuild (native Fedora/RHEL tooling).
# Requires: sudo dnf install rpm-build
# No Ruby/fpm needed — use this script for local Fedora development.
#
# The spec is generated here, not kept as a file: a checked-in spec drifted out
# of sync once already (stale Version, and a %post that only enabled the
# service instead of restarting it, so upgrades kept running the old binary).
# Version comes from package.json and the scriptlets are the same
# postinstall.sh / preuninstall.sh that build-deb.sh and fpm use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASE_DIR="$AGENT_DIR/release"
RPMBUILD_DIR="$HOME/rpmbuild"
NAME="easy-pdf-sign-helper"
VERSION="$(node -p "require('$AGENT_DIR/package.json').version")"

mkdir -p "$RPMBUILD_DIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

cp "$RELEASE_DIR/${NAME}-linux"      "$RPMBUILD_DIR/SOURCES/$NAME"
chmod 755 "$RPMBUILD_DIR/SOURCES/$NAME"
cp "$SCRIPT_DIR/${NAME}.service"     "$RPMBUILD_DIR/SOURCES/"
cp "$SCRIPT_DIR/${NAME}.desktop"     "$RPMBUILD_DIR/SOURCES/"

SPEC="$RPMBUILD_DIR/SPECS/${NAME}.spec"
cat > "$SPEC" << EOF
Name:           $NAME
Version:        $VERSION
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
install -Dm755 %{_sourcedir}/$NAME \\
    %{buildroot}/usr/local/bin/$NAME
install -Dm644 %{_sourcedir}/$NAME.service \\
    %{buildroot}/usr/lib/systemd/user/$NAME.service
install -Dm644 %{_sourcedir}/$NAME.desktop \\
    %{buildroot}/etc/xdg/autostart/$NAME.desktop

%files
/usr/local/bin/$NAME
/usr/lib/systemd/user/$NAME.service
/etc/xdg/autostart/$NAME.desktop

%post
EOF

# Appended rather than inlined in the heredoc so that \$ and \` in the shell
# scripts are not expanded while writing the spec.
cat "$SCRIPT_DIR/postinstall.sh"  >> "$SPEC"
printf '\n%%preun\n'              >> "$SPEC"
cat "$SCRIPT_DIR/preuninstall.sh" >> "$SPEC"
printf '\n%%changelog\n'          >> "$SPEC"

rpmbuild -bb "$SPEC"

find "$RPMBUILD_DIR/RPMS/x86_64" -name "${NAME}-${VERSION}-*.rpm" \
  -exec cp {} "$RELEASE_DIR/${NAME}.rpm" \;

echo "Built: $RELEASE_DIR/${NAME}.rpm (v$VERSION)"
