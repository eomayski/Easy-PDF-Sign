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

## POST /ads/confirm-view

Confirms ad watch, issues download token.

**Request:**
```json
{
  "jobId": "uuid",
  "reward": {
    "provider": "mock",
    "adSessionId": "session-id",
    "signalToken": "optional"
  }
}
```

For `provider: "mock"` (Phase 0): auto-confirms without network call.

**Response `200`:**
```json
{ "downloadToken": "jwt-string" }
```

**Response `400`:** job not in `signed` state.

---

## POST /ads/reward-callback  _(Phase 2)_

Server-to-server callback from the ad network. Format varies by provider.
Backend stores the confirmation so `/ads/confirm-view` can verify it.

---

## GET /download/:token

One-time download. Token is a short-lived JWT containing `jobId`.

**Response `200`:** `application/pdf` stream with `Content-Disposition: attachment`.

After streaming, both the original and signed PDFs are deleted from disk.

**Response `401`:** invalid or expired token.
**Response `404`:** file already downloaded or cleaned up.
