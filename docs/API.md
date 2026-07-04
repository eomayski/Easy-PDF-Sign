# API Contract

Base URL: `http://localhost:4000/api` (dev). Frontend proxies `/api` → backend.

All request/response bodies are JSON unless noted.

---

## POST /upload

Uploads a PDF file.

**Request:** `multipart/form-data`, field name `file`.

**Response `200`:**
```json
{ "jobId": "uuid", "numPages": 5 }
```

---

## GET /files/:jobId

Streams the original PDF for the viewer. No auth required (jobId acts as token).

**Response:** `application/pdf` stream.

---

## POST /sign/prepare

Applies visual signature appearance. For mock method: signs immediately. For physical: returns hash.

**Request:**
```json
{
  "jobId": "uuid",
  "page": 1,
  "pdfRect": { "x": 72.0, "y": 100.0, "width": 200.0, "height": 80.0 },
  "visualConfig": {
    "showName": true,
    "showDate": true,
    "freeText": "Вярно с оригинала",
    "imageDataUrl": null,
    "handwrittenDataUrl": "data:image/png;base64,...",
    "layout": "text-left-image-right"
  },
  "method": "mock"
}
```

`pdfRect` is in **PDF user-space** (points, bottom-left origin). Use `viewportToPdfRect()` on the frontend before sending.

`layout` values: `"text-left-image-right"` | `"text-only"` | `"image-only"` | `"text-above-image"`

**Response `200` (mock):**
```json
{ "jobId": "uuid", "status": "signed" }
```

**Response `200` (physical — Phase 1):**
```json
{ "jobId": "uuid", "byteRangeHash": "hex-encoded-sha256" }
```

**Response `501`** — for the `cloud` method (Phase 3, on hold). `physical` is fully implemented (Phase 1).

---

## POST /sign/complete  _(Phase 1)_

Embeds the CMS signature from the helper agent.

**Request:**
```json
{ "jobId": "uuid", "cms": "hex-encoded-der-cms" }
```

**Response `200`:**
```json
{ "jobId": "uuid", "status": "signed" }
```

---

## POST /sign/cloud/start  _(Phase 3)_

Initiates remote signing with a cloud provider.

**Request:**
```json
{ "jobId": "uuid", "provider": "evrotrust", "userIdentifier": "+359..." }
```

**Response `200`:**
```json
{ "jobId": "uuid", "status": "pending" }
```

---

## GET /jobs/:jobId  _(Phase 3 polling)_

**Response `200`:**
```json
{ "status": "pending" | "signed", "ready": false }
```

---

## GET /files/:jobId/signed  _(Phase 2´)_

Streams the **signed** PDF inline for the download-page preview. No auth required —
the preview is always visible (see `docs/ACCOUNTS.md`, "Core rule"); only the actual
download is gated.

**Response `200`:** `application/pdf` stream, `Content-Disposition: inline`.
**Response `404`:** job missing or not in `signed` state.

---

## Accounts & Credits  _(Phase 2´ — auth + credits implemented; payments pending)_

Full design in `docs/ACCOUNTS.md`. **Register / login / logout / password reset are not
backend endpoints** — the frontend talks to Supabase Auth directly via
`@supabase/supabase-js`, and the backend only verifies the Supabase-issued JWT sent as
`Authorization: Bearer <token>`.

### GET /auth/me  _(auth required)_
Also provisions the local user row (with the 5-credit signup bonus) on first call.
**Response `200`:** `{ "userId": "uuid", "email": "...", "accountType": "free" | "business", "credits": 5 }` or `401` if not authenticated.

### GET /credits/balance  _(auth required)_
**Response `200`:** `{ "credits": 5, "accountType": "free" | "business" }`.

### POST /credits/purchase  _(auth required — **501 stub**)_
Will buy a package (50 credits for €2.90, one-time, non-expiring) via `PaymentProvider`
(Stripe) in the payments milestone. Currently returns `501`.

### POST /billing/subscribe  _(planned — payments milestone)_
Starts/renews the business monthly subscription (unlimited credits, custom stamp upload).

### POST /account/stamp  _(planned — payments milestone, business accounts only)_
Uploads and persists a custom stamp/seal image (печат) for reuse across documents.

### POST /download/request  _(auth required — replaced /ads/confirm-view)_
Verifies the job is `signed`, checks the caller is authenticated, and debits 1 credit
(skipped for `business` accounts with an active subscription) atomically before issuing
the download token.
```json
{ "jobId": "uuid" }
```
**Response `200`:** `{ "downloadToken": "jwt-string", "creditsRemaining": 4 }`.
**Response `401`:** not authenticated.
**Response `402`:** authenticated but 0 credits remaining (client should prompt to buy a package or upgrade to business).
**Response `400`:** job not in `signed` state.
**Response `404`:** job not found.

---

## GET /download/:token

Download with a short-lived JWT containing `jobId`. **Reusable while valid** — the credit
is debited once at `/download/request`; re-downloads with the same token are free, so an
interrupted stream can be retried.

**Response `200`:** `application/pdf` stream with `Content-Disposition: attachment`.

Files are NOT deleted after streaming — a TTL sweeper removes the job and its PDFs
1 hour after upload (GDPR retention bound).

**Response `401`:** invalid or expired token.
**Response `404`:** files cleaned up (job TTL expired).
