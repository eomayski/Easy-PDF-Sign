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

**Response `501`** — for `physical` and `cloud` methods until Phase 1/3 is implemented.

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

## ~~POST /ads/confirm-view~~  _(Phase 0, superseded by Phase 2´)_

Historical Phase 0 mechanism: confirmed a mock ad watch and issued a download token.
Being replaced by `POST /download/request` below, which gates on account + signature
credits instead of an ad view. Kept here for history; remove once Phase 2´ ships.

---

## ~~POST /ads/reward-callback~~  _(Phase 2, abandoned)_

Was planned as the server-to-server callback from a real ad network (GAM). The rewarded-ads
approach was abandoned in favor of the account/credits model — see Phase 2´ in `CLAUDE.md`
and `docs/ACCOUNTS.md`. Do not implement this endpoint.

---

## Accounts & Credits  _(Phase 2´ — planned, not yet implemented)_

Full design in `docs/ACCOUNTS.md`. Endpoint sketch:

### POST /auth/register
```json
{ "email": "user@example.bg", "password": "..." }
```
Creates a user with 5 free signature credits. **Response `200`:** sets an auth session
(HttpOnly cookie or JWT) and returns `{ "userId": "uuid", "credits": 5 }`.

### POST /auth/login
```json
{ "email": "user@example.bg", "password": "..." }
```
**Response `200`:** auth session, same shape as register.

### POST /auth/logout
Clears the auth session.

### GET /auth/me
**Response `200`:** `{ "userId": "uuid", "email": "...", "accountType": "free" | "business", "credits": 5 }` or `401` if not authenticated.

### GET /credits/balance  _(auth required)_
**Response `200`:** `{ "credits": 5, "accountType": "free" | "business" }`.

### POST /credits/purchase  _(auth required)_
Buys a package: 50 credits for €2.90 (one-time, non-expiring).
```json
{ "package": "50-credits" }
```
**Response `200`:** `{ "credits": 55, "paymentStatus": "completed" }` (via `PaymentProvider`, e.g. Stripe Checkout — actual flow will involve a redirect/webhook, sketch simplified here).

### POST /billing/subscribe  _(auth required)_
Starts/renews the business monthly subscription (unlimited credits, custom stamp upload).
**Response `200`:** `{ "accountType": "business", "subscriptionStatus": "active" }`.

### POST /account/stamp  _(auth required, business accounts only)_
Uploads and persists a custom stamp/seal image (печат) for reuse across documents.
**Request:** `multipart/form-data`, field name `image`.
**Response `200`:** `{ "stampImageUrl": "..." }`. **Response `403`:** account is not `business`.

### POST /download/request  _(auth required — replaces /ads/confirm-view)_
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

---

## GET /download/:token

One-time download. Token is a short-lived JWT containing `jobId`.

**Response `200`:** `application/pdf` stream with `Content-Disposition: attachment`.

After streaming, both the original and signed PDFs are deleted from disk.

**Response `401`:** invalid or expired token.
**Response `404`:** file already downloaded or cleaned up.
