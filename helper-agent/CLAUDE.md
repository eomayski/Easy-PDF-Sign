# Helper Agent — Agent Context

Local native process (Node.js, packaged with `@yao-pkg/pkg`) that gives the browser access to PKCS#11 smart cards. Installed once by the user; communicates with the web app over `http://127.0.0.1:17357`.

**Current status: Phase 1 COMPLETE.** PKCS#11 signing works end-to-end — PIN prompt, smart card signing, detached CMS returned to backend. Verified against eIDAS validation site.

## Why this exists

Browsers cannot call PKCS#11 directly. The private key must never leave the card. This agent acts as a thin bridge: it receives a SHA-256 hash from the browser, passes it to the card for signing via PKCS#11, and returns the detached CMS blob. The key stays on the card.

## Loopback TLS (Safari)

Safari is the only browser that treats `http://127.0.0.1` from an HTTPS page as mixed content and blocks it ([WebKit 171934](https://bugs.webkit.org/show_bug.cgi?id=171934), open since 2017) — Chrome, Edge and Firefox all allow loopback. So the agent listens **twice**: HTTP on 17357 (unchanged, every browser) and HTTPS on 17358 (macOS only, or `AGENT_TLS=1` elsewhere for testing).

`src/tls.ts` generates the chain **on the user's machine**, driven by the `openssl` CLI through real config files (`-addext` does not exist in the LibreSSL macOS ships) into `~/Library/Application Support/EasyPDFSign/tls/`:

| File | Lifetime | Notes |
|------|----------|-------|
| `ca.pem` / `ca.key` (0600) | 10 years | `nameConstraints` **critical**: `DNS:localhost` + `IP:127.0.0.1` only |
| `server.pem` / `server.key` | 800 days | SAN `DNS:localhost,IP:127.0.0.1`, EKU `serverAuth` |

Three decisions worth keeping:

- **The CA key is kept, not destroyed.** Apple caps server certificates from admin-added roots at 825 days (the newer 398-day rule [does not apply to admin-added roots](https://support.apple.com/en-us/102028); the older 825-day one does). Keeping the key lets the agent re-issue the leaf — it re-checks daily and swaps it in with `setSecureContext()`, so no reinstall and no second trip to the keychain. Name constraints are what make holding that key acceptable: it can only ever sign for localhost.
- **`::1` is deliberately absent** from both the constraints and the SAN. The agent binds `127.0.0.1` only, and IPv6 name-constraint syntax is the part of openssl most likely to vary between builds.
- **TLS failure is never fatal.** Any error just logs and leaves HTTP serving — which covers every browser except Safari.

`--init-tls` generates the material and prints the CA path; `installer/macos/scripts/postinstall` runs it as the console user (`sudo -H -u`) and feeds the path to `security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain`. `launcher.sh` skips its log redirection for this one flag, otherwise the path would end up in the log file instead of the installer's stdout.

`uninstall.sh` must remove the root — a trusted CA left behind is the one genuinely harmful leftover. It calls `security remove-trusted-cert -d` (needs the file, so *before* deleting the material) and then loops `security delete-certificate -c "Easy PDF Sign Local CA" -t /Library/Keychains/System.keychain` (positional keychain — `delete-certificate` has no `-k`).

**Known limitation:** on a multi-user Mac only the account that ran the installer gets Safari support — the CA is machine-wide but the material is per-user. Other accounts fall back to HTTP, i.e. Chrome/Edge/Firefox.

## HTTP API

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ ok, version, pkcs11, tls: { enabled, expires } }` |
| GET | `/certificates` | — | `CertInfo[]` |
| POST | `/sign` | `{ hash: string (hex), certId: string }` | `{ cms: string (hex) }` |

## Interface contract

The agent must implement `LocalSigningProvider` (defined in `src/types.ts`):

```ts
interface LocalSigningProvider {
  isAvailable(): Promise<boolean>;
  listCertificates(): Promise<CertInfo[]>;
  signHash(hash: Uint8Array, certId: string): Promise<Uint8Array>;  // detached CMS/PKCS#7
}
```

## Phase 1 implementation (done)

Uses `graphene-pk11` (wraps `pkcs11js`) for PKCS#11 access.

- PKCS#11 module path: tries `opensc-pkcs11.dll` by default; configurable via `PKCS11_LIB` env var.
- `GET /certificates`: `C_FindObjects` filtered by `CKA_CLASS=CKO_CERTIFICATE` + `CKU_NON_REPUDIATION`.
- `POST /sign`: `C_Sign` with `CKM_SHA256_RSA_PKCS`. Result wrapped in detached PKCS#7 `SignedData` via `node-forge`.
- PIN prompt: OS credential dialog — PIN never crosses the HTTP boundary.

**Not yet done:** TLS on localhost (`mkcert`) — currently HTTP only on loopback.

## Build & Release

Installers are built by GitHub Actions and published as GitHub Release assets. **Never build locally for distribution** — use the CI pipeline.

**To release:**
```bash
npm version 0.x.0 --no-git-tag-version   # in helper-agent/ — the only place to bump
git commit -am "chore(helper): v0.x.0" && git tag helper-agent-v0.x.0
git push origin main helper-agent-v0.x.0
```

**`helper-agent/package.json` is the single source of truth for the version.**
Nothing else hardcodes it:
- `/health` reads it via `require('../package.json')` — works in dev, in `dist/` and inside the pkg snapshot (`pkg.config.json` ships `package.json` as an asset).
- The frontend's `LATEST_HELPER_VERSION` is injected by `vite.config.ts` (`define: __HELPER_VERSION__`) by reading this same file; if it is unreachable at build time it falls back to `0.0.0`, which silently disables the "update available" banner rather than showing a wrong version.
- `.deb` / `.rpm` metadata already read it with `node -p`.
- The NSIS installer gets it as `/DVERSION=` from `installer/windows/build-installer.js` (→ `VIProductVersion` + the `DisplayVersion` registry value).

**Upgrades must stop the running agent first — on every platform.** The symptom is always the same and misleading: signing still works, but `/health` reports the old version and the site keeps showing the "update available" banner.
- **Windows:** the install section starts with `schtasks /end` + `taskkill /F /IM`. Without it NSIS fails with "error opening file for writing" on the locked exe, and a user who clicks Ignore keeps the *old* binary.
- **Linux:** `postinstall.sh` does `enable` + `restart`, and `pkill`s any instance systemd does not own (the xdg autostart entry starts one too — it would survive the restart and keep port 17357, so the new binary could never bind). `preuninstall.sh` deliberately does nothing on upgrade, only on real removal.
- **macOS:** `scripts/preinstall` boots the LaunchAgent out, `scripts/postinstall` bootstraps + kickstarts it.

Only Windows can fail the *install* itself — on POSIX the package manager replaces the binary by rename, which is legal for a running executable.

Workflow: `.github/workflows/build-helper-agent.yml`
- `windows-2022` runner → `easy-pdf-sign-helper-setup.exe` (NSIS installer, no admin/UAC needed)
- `ubuntu-latest` runner → `easy-pdf-sign-helper.deb` + `easy-pdf-sign-helper.rpm`
- `macos-latest` (arm64) + `macos-15-intel` (x86_64) → one binary each → assembled by a third job into `easy-pdf-sign-helper.pkg`

**Key build details:**
- Runtime: Node 22 (pkg target `node22-*`) — required because Node 22's bundled node-gyp supports VS 2022 on the `windows-2022` runner. Do not switch to `windows-latest` (has VS 2026 which causes node-gyp buffer overflow).
- `pkg.config.json` bundles `pkcs11js/build/Release/pkcs11.node` as an asset.
- Linux packages use `fpm` — all flags must come before the positional source argument (`.`). CI builds both `.deb` and `.rpm` through `build-packages.sh`; `build-deb.sh` / `build-rpm.sh` are the fpm-free local-dev equivalents. All three reuse the same `postinstall.sh` / `preuninstall.sh`, and `build-rpm.sh` **generates** the spec (version from `package.json`, scriptlets inlined) — there is deliberately no checked-in `.spec`, because the one that existed drifted out of sync.
- The bundled `pkcs11.node` is **architecture-specific** — never build a `--target …-x64` binary on an arm64 runner (an x86_64 process cannot dlopen an arm64 addon). `build-pkg.sh` verifies each slice with `lipo -archs` and fails the build on a mismatch.
- Only artifacts named `easy-pdf-sign-helper-*` are published as Release assets; the intermediate `mac-binary-*` slices deliberately are not — a bare Mach-O with no extension opens as a text file for the user.

## macOS installer (`installer/macos/`)

`.pkg` built with `pkgbuild` + `productbuild` (`npm run build:mac-pkg`, after `build:mac-arm64` / `build:mac-x64`). Installs system-wide (admin password prompt):

| Path | What |
|------|------|
| `/usr/local/libexec/easy-pdf-sign-helper/easy-pdf-sign-helper-{arm64,x64}` | both arch slices |
| `/usr/local/bin/easy-pdf-sign-helper` | `launcher.sh` — execs the slice matching `uname -m` |
| `/usr/local/bin/easy-pdf-sign-helper-uninstall` | `sudo` uninstaller |
| `/Library/LaunchAgents/bg.easypdfsign.helper.plist` | starts the agent at every user's login |

- Two separate binaries, not one universal file: pkg appends its payload **after** the Mach-O, so `lipo` cannot fuse them.
- LaunchAgent, not LaunchDaemon — the PIN prompt is an `osascript` dialog and needs the user's GUI session.
- `scripts/preinstall` stops the running agent (upgrade), `scripts/postinstall` bootstraps it for the console user so no logout/reboot is needed. Both must `exit 0` or Installer.app reports failure.
- **Unsigned / not notarized.** Gatekeeper makes the user right-click → Open (the frontend shows this hint — `helper.macGatekeeperHint`). Removing that friction needs an Apple Developer ID ($99/yr) + `productsign` + `notarytool`.

### Diagnosing "the site does not see the agent" on macOS

Two logs, both written without any extra setup:

| Where | What |
|-------|------|
| `/var/log/install.log` | every step of `scripts/postinstall` (console user, bootstrap result) **and a `curl` self-check against `/health`** — `grep -i easy-pdf-sign /var/log/install.log \| tail -40` |
| `~/Library/Logs/easy-pdf-sign-helper.log` | the agent's own output: start time, arch, chosen slice, version, allowed origins, PKCS#11 lib |

`launcher.sh` redirects to that log **only when stdout is not a tty**, so running `/usr/local/bin/easy-pdf-sign-helper` by hand still prints to the terminal. The redirection is guarded by a writability probe — a failing `exec` redirect would otherwise kill the shell and take the agent with it.

Then split the problem: if `curl -s http://127.0.0.1:17357/health` answers but the browser does not see the agent, it is the browser (Safari blocks `http://127.0.0.1` from an HTTPS page more aggressively than Chrome) or the page origin is missing from `ALLOWED_ORIGINS` — which the startup log prints. `launchctl print gui/$(id -u)/bg.easypdfsign.helper` shows whether launchd has the job at all; macOS 13+ can also hold it under System Settings → General → Login Items & Extensions.

## Local dev

```bash
npm run dev   # port 17357
```

`pkcs11js` is a native C++ addon. On Windows, `npm install` requires VS Build Tools and Python. To skip native compilation during dev (smart card not needed):

```bash
npm install --ignore-scripts
npm run dev
```

`/health` and `/certificates` will work; `/sign` is stubbed regardless.

## Security requirements

- Listen only on `127.0.0.1` (loopback), not `0.0.0.0`.
- CORS is an explicit origin **allowlist** — defaults to the production site + `http://localhost:5173`; `APP_ORIGIN` env var (comma-separated) overrides. Keep it strict: the origin check is what stops arbitrary websites from asking the local agent to sign hashes.
- No PIN or private key material ever crosses the HTTP boundary.
- TLS on localhost (self-signed via `mkcert`) before production distribution.
