# Backend — Agent Context

Express + TypeScript server. Handles PDF upload, visual signature rendering, signing orchestration, and download token issuance.

## Run

```bash
npm run dev   # ts-node-dev, port 4000
npm run build # tsc → dist/
npm test      # vitest run — no DB needed, Prisma is mocked
```

## Route map

| Method | Path | Handler file | What it does |
|--------|------|--------------|--------------|
| POST | `/api/upload` | `routes/upload.ts` | Accepts PDF, stores to `UPLOAD_DIR`, returns `{ jobId, numPages, creditsCharged, creditsRemaining }`. Optional auth; files above `FREE_UPLOAD_SIZE_MB` require an account and cost credits — see "Upload size policy" below |
| DELETE | `/api/jobs/:jobId` | `routes/jobs.ts` | Discards the job + its PDFs immediately when the user leaves the flow. No auth (jobId is the capability, as for `/files/:jobId`); idempotent `204` |
| GET | `/api/files/:jobId` | `routes/files.ts` | Streams original PDF to the viewer |
| POST | `/api/sign/prepare` | `routes/sign.ts` | Applies visual layer; for mock: also saves signed PDF; for physical: returns hash |
| POST | `/api/sign/complete` | `routes/sign.ts` | Embeds CMS from helper-agent (Phase 1, working end-to-end) |
| POST | `/api/sign/cloud/start` | _(Phase 3 — on hold, not planned for now)_ | Initiates cloud signing |
| GET | `/api/jobs/:id` | _(Phase 3 — on hold)_ | Polls cloud signing status |
| GET | `/api/files/:jobId/signed` | `routes/files.ts` | Streams signed PDF inline for the download-page preview (no auth — preview is always visible) |
| GET | `/api/auth/me` | `routes/auth.ts` | Current user + credits; provisions the user row (+5 signup bonus) on first call. Register/login live in Supabase, not here |
| GET | `/api/credits/balance` | `routes/credits.ts` | Credit balance for the logged-in user |
| POST | `/api/credits/purchase` | `routes/credits.ts` | Stripe Checkout URL for the 50-credit package (€2.99) |
| POST | `/api/billing/subscribe` | `routes/billing.ts` | Stripe Checkout URL for the business subscription (€5.99/mo) |
| POST | `/api/billing/portal` | `routes/billing.ts` | Stripe Customer Portal URL (manage/cancel subscription) |
| POST | `/api/billing/webhook` | `routes/billing.ts` | Stripe fulfilment: credit grants + subscription state sync. Raw-body route registered in `index.ts` **before** `express.json()` |
| POST | `/api/download/request` | `routes/download.ts` | Replaced `/api/ads/confirm-view`: requires auth, atomically debits 1 credit (skipped for business), issues the download JWT |
| GET | `/api/download/:token` | `routes/download.ts` | Validates JWT, streams signed PDF, deletes files |

### Auth (Phase 2´)

`middleware/auth.ts` → `requireAuth` verifies the Supabase JWT from `Authorization: Bearer`
(JWKS via `SUPABASE_URL`, HS256 fallback via `SUPABASE_JWT_SECRET`) and sets `req.auth =
{ userId, email }`. `optionalAuth` does the same verification but never rejects — used by
`/api/upload`, where small files stay anonymous and only oversized ones need an account.
`services/users.ts` owns user provisioning (`ensureUser`, idempotent signup bonus) and the
atomic credit operations (`debitCreditForDownload`, `debitCreditsForUploadSize`,
`refundUploadSizeFee` — conditional `updateMany` with `credits >= n`, so parallel requests
can't double-spend).

### Upload size policy

`config/uploadPolicy.ts` owns the tiers: free up to `FREE_UPLOAD_SIZE_MB`, then 1 credit per
started `CREDIT_STEP_SIZE_MB`, hard-capped at `MAX_UPLOAD_SIZE_MB`. `creditsForSize()` is the
pure function; env is read lazily so tests can stub it. Full rules and the formula are in
`docs/ACCOUNTS.md` → "Upload size fees"; error codes in `docs/API.md`.

Two enforcement layers in `routes/upload.ts`: a `Content-Length` pre-flight that rejects
before the body is buffered (with `MULTIPART_OVERHEAD_ALLOWANCE` slack so a file *at* the
threshold is never wrongly refused), then `receiveSinglePdf()` in `middleware/upload.ts`,
which builds a multer instance **per request** because the limit depends on auth.

⚠️ multer/busboy treats `limits.fileSize` as **exclusive** — a file of exactly `fileSize`
bytes is rejected. `receiveSinglePdf()` takes an *inclusive* max and adds the +1 itself; don't
"simplify" that away or "up to 5 MB" breaks at exactly 5 MB.

The size fee is charged at upload time (unlike the download debit) and refunded via
`upload_size_refund` if anything after the debit fails — jobs are in-memory, so the debit and
the upload can't share one transaction.

Users/credits live in Postgres via Prisma (`prisma/schema.prisma`, client singleton in
`src/db/prisma.ts`). Jobs are still in-memory (`store/jobs.ts`).

### Planned — rest of Phase 2´

`POST /api/account/stamp` (business stamp upload). Payments are done — see
`services/billing/` below.

## Service layer

### `services/pdf/visualSignature.ts`
Renders the visible signature box onto the PDF using **pdf-lib**.  
⚠️ Must embed a custom TTF (via `@pdf-lib/fontkit`) because pdf-lib's built-in fonts don't support Cyrillic. Font loaded from `services/pdf/fonts.ts`.

### `services/pdf/fonts.ts`
Loads a Cyrillic-capable TTF: the bundled `assets/fonts/NotoSans-Regular.ttf` first (required on bare containers — Railway's image has no fonts), then system fonts (Arial on Windows, Liberation/Noto on Linux).  
Font is cached in memory after first load — do not call `loadCyrillicFont()` in a hot path.

### `services/signing/mockSigner.ts`
Phase 0 mock: applies visual layer only, no crypto. Returns modified PDF bytes.

### `services/providers/`

| File | Interface / Class | Phase |
|------|-------------------|-------|
| `LocalSigningProvider.ts` | Interface (docs only — implemented in `/helper-agent`) | 1 |
| `CloudSignerProvider.ts` | Interface | 3 |
| `MockCloudProvider.ts` | Auto-approves after 2 s | dev/test |

### `services/download/downloadToken.ts`
Issues and verifies single-use JWT download tokens. Secret from `DOWNLOAD_TOKEN_SECRET` env var. (Moved here from `services/ads/` when the ad code path was deleted.)

### `services/users.ts`
User provisioning + credit accounting (see "Auth" above).

### `services/billing/`
`PaymentProvider.ts` (provider-agnostic interface) + `StripePaymentProvider.ts`
(implementation, exports the `paymentProvider` singleton). Checkout endpoints only mint
redirect URLs; **all fulfilment happens in the webhook** — package credits are granted
idempotently (`CreditTransaction.stripeEventId` unique constraint absorbs retries),
subscription state is a pure projection of the Stripe subscription object. Env vars are
read lazily: without Stripe keys the server boots fine and billing endpoints return `503`.
See `docs/ACCOUNTS.md` for the full mechanics.

## Job state machine

Implemented in `store/jobs.ts` (in-memory, Phase 0). Replace with Prisma queries in Phase 2+ (also needed to back the user/credits tables for Phase 2´).

```
uploaded → prepared → signed → downloaded
```

Files are **not** deleted on download — the download token stays reusable (free
re-download after an interrupted stream).

### Retention

Three mechanisms, in order of who normally wins:

1. **Explicit discard** — `DELETE /api/jobs/:jobId`, fired by the frontend when the user
   leaves the flow ("sign another document" / reset). This is the primary cleanup for
   documents that were never signed: they go immediately, not after a TTL.
2. **Status-dependent TTL** (`store/jobs.ts`) — `JOB_TTL_MINUTES` (60) while unsigned,
   dropping to `SIGNED_JOB_TTL_MINUTES` (15) the moment the job is signed, counted from
   signing. `updateJob()` applies the switch centrally, so the three `status: 'signed'`
   call sites in `routes/sign.ts` don't each have to remember it.
3. **`extendJob()`** — called from `POST /download/request` with the download token's TTL.
   ⚠️ Do not remove: the credit is already debited at that point, so the file has been paid
   for and must outlive the token. Without it a 15-minute file plus a 1-hour token means a
   retried download 404s on something the user was charged for.

`deleteJob()` unlinks the PDFs as well as dropping the map entry — it used to only do the
latter, which leaked files.

⚠️ Do **not** wire discard to `beforeunload`/`pagehide` on the frontend: those fire on F5
and on the Google OAuth full-redirect fallback, which `lib/flowPersistence.ts` exists to
survive. Abandoned sessions are the TTL's job, not a beacon's.

## Key env vars

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | 4000 | |
| `UPLOAD_DIR` | `./uploads` | Auto-created on startup |
| `FREE_UPLOAD_SIZE_MB` | 5 | Largest free upload; no account needed at or below it |
| `CREDIT_STEP_SIZE_MB` | 5 | Each started step above the free tier costs 1 credit |
| `MAX_UPLOAD_SIZE_MB` | 200 | Absolute cap, rejected for everyone regardless of credits |
| `JOB_TTL_MINUTES` | 60 | Retention for an **unsigned** job (abandoned upload backstop) |
| `SIGNED_JOB_TTL_MINUTES` | 15 | Retention once signed, counted from signing |
| `DOWNLOAD_TOKEN_SECRET` | (required) | Use a long random string in prod |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | 3600 | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `SUPABASE_URL` | (required for auth) | Project URL — JWKS fetched from `<url>/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_SECRET` | (optional) | Legacy HS256 secret; only for older Supabase projects |
| `DATABASE_URL` | (required for auth) | Supabase Postgres, transaction pooler (`:6543`, `?pgbouncer=true`) — Prisma runtime |
| `DIRECT_URL` | (required for auth) | Supabase Postgres, session pooler (`:5432`) — `prisma migrate` |
| `STRIPE_SECRET_KEY` | (required for billing) | `sk_test_...` / `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | (required for billing) | `whsec_...` — from the dashboard endpoint, or from `stripe listen` in dev |
| `STRIPE_PRICE_CREDITS_50` | (required for billing) | `price_...` of the 50-credit one-time product |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | (required for billing) | `price_...` of the €5.99/mo recurring product |

Phase 3+ env vars (cloud QES providers) are in `.env.example` with TODO comments.

## Adding a new signing provider

1. Create `services/providers/YourProvider.ts` implementing `CloudSignerProvider`.
2. Wire it into `routes/sign.ts` `cloud/start` handler behind `provider` body param.
3. Add env vars to `.env.example`.
