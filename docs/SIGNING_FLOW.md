# PAdES Signing Flow

## Core principle: hash-then-sign

PAdES requires that the signature cover the byte stream of the final PDF. The flow is always:

```
1. Add visual appearance (pdf-lib)
2. Insert PAdES placeholder (empty byte range in the signature dict)
3. Compute SHA-256 hash over ByteRange (everything except the placeholder)
4. Generate detached CMS/PKCS#7 signature over that hash
5. Embed the CMS back into the placeholder
```

Steps 1–2 and 5 run **server-side** (backend). Step 4 depends on the signing method.

---

## Phase 0 — Mock (no crypto)

```
Browser                 Backend
  │── POST /api/upload ──────────────────────► store PDF, return jobId
  │
  │── POST /api/sign/prepare ────────────────► pdf-lib: draw visual rect
  │   { jobId, page, pdfRect,                  save as "signed" PDF
  │     visualConfig, method:"mock" }          return { jobId }
  │
  │── POST /api/ads/confirm-view ────────────► auto-confirm (mock)
  │   { jobId, reward:{provider:"mock"} }       issue JWT download token
  │
  │── GET /api/download/:token ──────────────► stream PDF, delete files
```

No crypto. The "signed" PDF has a visual stamp but no cryptographic signature.

---

## Phase 1 — Physical QES (smart card via helper agent)

```
Browser                 Backend               Helper Agent (localhost:17357)
  │── POST /api/sign/prepare ────────────────►
  │   { method:"physical" }                   pdf-lib: draw visual rect
  │                                           @signpdf: add placeholder
  │◄──────────────────────────────────────── { jobId, byteRangeHash }
  │
  │── GET /certificates ─────────────────────────────────────────────────►
  │◄──────────────────────────────────────────────────────────────────── CertInfo[]
  │
  │── POST /sign ───────────────────────────────────────────────────────►
  │   { hash, certId }                                                    PKCS#11: C_Sign
  │◄──────────────────────────────────────────────────────────────────── { cms (hex) }
  │
  │── POST /api/sign/complete ─────────────────────────────────────────►
  │   { jobId, cms }                          embed CMS in placeholder
  │                                           final PAdES PDF saved
  │◄────────────────────────────────────────
```

The private key NEVER leaves the card. The agent only performs `C_Sign` on the hash.

---

## Phase 3 — Cloud QES (Evrotrust / B-Trust)

```
Browser                 Backend               Provider API    User mobile app
  │── POST /api/sign/prepare ────────────────►
  │   { method:"cloud", userIdentifier }      draw visual + placeholder
  │                                           hash computed
  │                                ──────────────────────────►
  │                                           POST /signing-requests
  │                                           { hash, userId }
  │                                ◄──────────────────────────
  │                                           { requestId }
  │                                                          ──► push notification
  │                                                              user approves + PIN
  │── GET /api/jobs/:jobId (polling) ─────────────────────────────────────────────
  │                                           GET /signing-requests/:id
  │                                ◄──────────────────────────
  │                                           { status: "completed", cms }
  │◄──────────────────── { ready: true } ─────
  │── POST /api/ads/confirm-view ──────────────────────────────────────────────────
  │── GET /api/download/:token ──────────────►
```

---

## PAdES Baseline levels

| Level | What it adds | Status |
|-------|-------------|--------|
| B-B | CAdES detached signature, `signingCertificateV2` attribute | Phase 1 target |
| B-T | Qualified timestamp from TSA | Phase 5 |
| B-LT | Certificate chain + OCSP/CRL embedded | Phase 5 |
| B-LTA | Archival timestamp | Future |

The backend uses `@signpdf/signpdf` with `SUBFILTER_ETSI_CADES_DETACHED` for B-B level.

---

## Validation

After signing, validate with:
- **DSS Demonstration WebApp**: https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation
- **ETSI PAdES Conformance Checker**

A valid B-B signature will show as `TOTAL-PASSED` in Adobe Acrobat and DSS.
