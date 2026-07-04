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
git tag helper-agent-v0.x.0
git push origin helper-agent-v0.x.0
```

Workflow: `.github/workflows/build-helper-agent.yml`
- `windows-2022` runner → `easy-pdf-sign-helper-setup.exe` (NSIS installer, no admin/UAC needed)
- `ubuntu-latest` runner → `easy-pdf-sign-helper.deb` + `easy-pdf-sign-helper.rpm`
- `macos-latest` runner → `easy-pdf-sign-helper-macos`

**Key build details:**
- Runtime: Node 22 (pkg target `node22-*`) — required because Node 22's bundled node-gyp supports VS 2022 on the `windows-2022` runner. Do not switch to `windows-latest` (has VS 2026 which causes node-gyp buffer overflow).
- `pkg.config.json` bundles `pkcs11js/build/Release/pkcs11.node` as an asset.
- Linux packages use `fpm` — all flags must come before the positional source argument (`.`).

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
