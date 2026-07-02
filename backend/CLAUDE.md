# Backend — Agent Context

Express + TypeScript server. Handles PDF upload, visual signature rendering, signing orchestration, ad verification, and download token issuance.

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
| POST | `/api/sign/complete` | `routes/sign.ts` | Embeds CMS from helper-agent (Phase 1, currently 501) |
| POST | `/api/sign/cloud/start` | _(Phase 3 — on hold, not planned for now)_ | Initiates cloud signing |
| GET | `/api/jobs/:id` | _(Phase 3 — on hold)_ | Polls cloud signing status |
| POST | `/api/ads/confirm-view` | `routes/ads.ts` | ❌ Phase 0 mechanism, being replaced by `/api/download/request` (Phase 2´, see below) |
| POST | `/api/ads/reward-callback` | `routes/ads.ts` | ❌ Abandoned — real ads (GAM) will not be implemented |
| GET | `/api/download/:token` | `routes/download.ts` | Validates JWT, streams signed PDF, deletes files |

### Planned — Accounts & Credits (Phase 2´)

Full design in `docs/ACCOUNTS.md` and endpoint sketch in `docs/API.md`. Summary of new routes to add:

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/auth/register` | Create user, grant 5 free credits, start session |
| POST | `/api/auth/login` / `/api/auth/logout` | Session management |
| GET | `/api/auth/me` | Current user + credit balance |
| GET | `/api/credits/balance` | Credit balance for the logged-in user |
| POST | `/api/credits/purchase` | Buy a package (50 credits / €2.90) via a new `PaymentProvider` |
| POST | `/api/billing/subscribe` | Start/renew business monthly subscription (unlimited credits) |
| POST | `/api/account/stamp` | Business accounts only — upload persisted stamp image (печат) |
| POST | `/api/download/request` | Replaces `/api/ads/confirm-view`: requires auth, atomically debits 1 credit (skipped for business), issues the download JWT |

This will need a persistent user store (Prisma/DB) — the current in-memory `store/jobs.ts` model is not sufficient once accounts exist.

## Service layer

### `services/pdf/visualSignature.ts`
Renders the visible signature box onto the PDF using **pdf-lib**.  
⚠️ Must embed a custom TTF (via `@pdf-lib/fontkit`) because pdf-lib's built-in fonts don't support Cyrillic. Font loaded from `services/pdf/fonts.ts`.

### `services/pdf/fonts.ts`
Loads a system TTF with Cyrillic support (Arial on Windows, Liberation/DejaVu on Linux).  
Font is cached in memory after first load — do not call `loadCyrillicFont()` in a hot path.

### `services/signing/mockSigner.ts`
Phase 0 mock: applies visual layer only, no crypto. Returns modified PDF bytes.

### `services/providers/`

| File | Interface / Class | Phase |
|------|-------------------|-------|
| `LocalSigningProvider.ts` | Interface (docs only — implemented in `/helper-agent`) | 1 |
| `CloudSignerProvider.ts` | Interface | 3 |
| `MockCloudProvider.ts` | Auto-approves after 2 s | dev/test |

### `services/ads/downloadToken.ts`
Issues and verifies single-use JWT download tokens. Secret from `DOWNLOAD_TOKEN_SECRET` env var.
This stays as-is under Phase 2´ — only what happens *before* token issuance changes (credit debit instead of ad verification). Consider moving/renaming out of `services/ads/` once the ad code path is deleted.

### `services/billing/` _(planned, Phase 2´)_
Will hold the `PaymentProvider` interface (packages + business subscriptions) and the atomic credit-debit logic used by `/api/download/request`. See `docs/ACCOUNTS.md`.

## Job state machine

Implemented in `store/jobs.ts` (in-memory, Phase 0). Replace with Prisma queries in Phase 2+ (also needed to back the user/credits tables for Phase 2´).

```
uploaded → prepared → signed → downloaded
```

Files are deleted from disk on `downloaded` transition (GDPR).

## Key env vars

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | 4000 | |
| `UPLOAD_DIR` | `./uploads` | Auto-created on startup |
| `DOWNLOAD_TOKEN_SECRET` | (required) | Use a long random string in prod |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | 3600 | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allow-list |

Phase 3+ env vars (cloud QES providers) are in `.env.example` with TODO comments.

## Adding a new signing provider

1. Create `services/providers/YourProvider.ts` implementing `CloudSignerProvider`.
2. Wire it into `routes/sign.ts` `cloud/start` handler behind `provider` body param.
3. Add env vars to `.env.example`.
