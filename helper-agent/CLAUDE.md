# Helper Agent — Agent Context

Local native process (Node.js, will be packaged with `pkg`) that gives the browser access to PKCS#11 smart cards. Installed once by the user; communicates with the web app over `http://127.0.0.1:17357`.

**Current status: Phase 1 STUB.** All endpoints exist and type-check, but `/sign` returns 501. PKCS#11 implementation is the Phase 1 deliverable.

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

## Phase 1 implementation plan

1. Add `graphene-pk11` or `pkcs11js` npm package for PKCS#11 access.
2. Load the PKCS#11 module path:
   - Windows: try `opensc-pkcs11.dll`, then vendor DLLs (SafeNet, Charismathics).
   - Configurable via `PKCS11_LIB` env var.
3. `GET /certificates`: call `C_FindObjects` filtered by `CKA_CLASS=CKO_CERTIFICATE` + `CKU_NON_REPUDIATION`.
4. `POST /sign`: call `C_Sign` with `CKM_SHA256_RSA_PKCS` (or ECDSA equivalent). Wrap result in a detached PKCS#7 `SignedData` (use `node-forge`).
5. PIN prompt: use OS credential dialog (`node-windows` / `electron-prompt`) — never send PIN over HTTP.
6. Package with `pkg` into a single `.exe` for Windows installer.

## Security requirements

- Listen only on `127.0.0.1` (loopback), not `0.0.0.0`.
- CORS origin must be restricted to the app domain (`APP_ORIGIN` env var).
- No PIN or private key material ever crosses the HTTP boundary.
- TLS on localhost (self-signed via `mkcert`) before production distribution.

## Run

```bash
npm run dev   # port 17357
```
