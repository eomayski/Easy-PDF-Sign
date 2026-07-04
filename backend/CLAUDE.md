# Backend — Agent Context

Express + TypeScript server. Handles PDF upload, visual signature rendering, signing orchestration, and download token issuance.

## Run

```bash
npm run dev   # ts-node-dev, port 4000
npm run build # tsc → dist/
```

## Route map

| Method | Path | Handler file | What it does |
|--------|------|--------------|--------------|
| POST | `/api/upload` | `routes/upload.ts` | Accepts PDF, stores to `UPLOAD_DIR`, returns `{ jobId, numPages }` |
| GET | `/api/files/:jobId` | `routes/files.ts` | Streams original PDF to the viewer |
| POST | `/api/sign/prepare` | `routes/sign.ts` | Applies visual layer; for mock: also saves signed PDF; for physical: returns hash |
| POST | `/api/sign/complete` | `routes/sign.ts` | Embeds CMS from helper-agent (Phase 1, working end-to-end) |
| POST | `/api/sign/cloud/start` | _(Phase 3 — on hold, not planned for now)_ | Initiates cloud signing |
| GET | `/api/jobs/:id` | _(Phase 3 — on hold)_ | Polls cloud signing status |
| GET | `/api/files/:jobId/signed` | `routes/files.ts` | Streams signed PDF inline for the download-page preview (no auth — preview is always visible) |
| GET | `/api/auth/me` | `routes/auth.ts` | Current user + credits; provisions the user row (+5 signup bonus) on first call. Register/login live in Supabase, not here |
| GET | `/api/credits/balance` | `routes/credits.ts` | Credit balance for the logged-in user |
| POST | `/api/credits/purchase` | `routes/credits.ts` | **501 stub** until the Stripe/`PaymentProvider` milestone |
| POST | `/api/download/request` | `routes/download.ts` | Replaced `/api/ads/confirm-view`: requires auth, atomically debits 1 credit (skipped for business), issues the download JWT |
| GET | `/api/download/:token` | `routes/download.ts` | Validates JWT, streams signed PDF, deletes files |

### Auth (Phase 2´)

`middleware/auth.ts` → `requireAuth` verifies the Supabase JWT from `Authorization: Bearer`
(JWKS via `SUPABASE_URL`, HS256 fallback via `SUPABASE_JWT_SECRET`) and sets `req.auth =
{ userId, email }`. `services/users.ts` owns user provisioning (`ensureUser`, idempotent
signup bonus) and the atomic credit debit (`debitCreditForDownload` — conditional
`updateMany` with `credits >= 1`, so parallel downloads can't double-spend).

Users/credits live in Postgres via Prisma (`prisma/schema.prisma`, client singleton in
`src/db/prisma.ts`). Jobs are still in-memory (`store/jobs.ts`).

### Planned — payments milestone (rest of Phase 2´)

`POST /api/billing/subscribe` (business subscription), `POST /api/account/stamp` (business
stamp upload), and a real `PaymentProvider` implementation (Stripe) behind
`services/billing/PaymentProvider.ts`.

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

### `services/billing/PaymentProvider.ts`
Interface only for now — Stripe implementation arrives with the payments milestone. See `docs/ACCOUNTS.md`.

## Job state machine

Implemented in `store/jobs.ts` (in-memory, Phase 0). Replace with Prisma queries in Phase 2+ (also needed to back the user/credits tables for Phase 2´).

```
uploaded → prepared → signed → downloaded
```

Files are **not** deleted on download — the download token stays reusable (free
re-download after an interrupted stream). A sweeper in `store/jobs.ts` deletes the job
and all its PDFs 1 hour after upload (GDPR retention bound).

## Key env vars

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | 4000 | |
| `UPLOAD_DIR` | `./uploads` | Auto-created on startup |
| `DOWNLOAD_TOKEN_SECRET` | (required) | Use a long random string in prod |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | 3600 | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `SUPABASE_URL` | (required for auth) | Project URL — JWKS fetched from `<url>/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_SECRET` | (optional) | Legacy HS256 secret; only for older Supabase projects |
| `DATABASE_URL` | (required for auth) | Supabase Postgres, transaction pooler (`:6543`, `?pgbouncer=true`) — Prisma runtime |
| `DIRECT_URL` | (required for auth) | Supabase Postgres, session pooler (`:5432`) — `prisma migrate` |

Phase 3+ env vars (cloud QES providers) are in `.env.example` with TODO comments.

## Adding a new signing provider

1. Create `services/providers/YourProvider.ts` implementing `CloudSignerProvider`.
2. Wire it into `routes/sign.ts` `cloud/start` handler behind `provider` body param.
3. Add env vars to `.env.example`.
