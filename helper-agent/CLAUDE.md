# Helper Agent — Agent Context

Local native process (Node.js, packaged with `@yao-pkg/pkg`) that gives the browser access to PKCS#11 smart cards. Installed once by the user; communicates with the web app over `http://127.0.0.1:17357`.

**Current status: Phase 1 COMPLETE.** PKCS#11 signing works end-to-end — PIN prompt, smart card signing, detached CMS returned to backend. Verified against eIDAS validation site.

## Why this exists

Browsers cannot call PKCS#11 directly. The private key must never leave the card. This agent acts as a thin bridge: it receives a SHA-256 hash from the browser, passes it to the card for signing via PKCS#11, and returns the detached CMS blob. The key stays on the card.

## HTTP API

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ ok, version, pkcs11 }` |
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
