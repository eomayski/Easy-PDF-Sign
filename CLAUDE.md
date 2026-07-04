# Easy PDF Sign — Agent Context

Web app for signing PDF documents with a Qualified Electronic Signature (QES / PAdES / eIDAS).
Target market: Bulgaria / EU. UI language: Bulgarian (i18n-ready).

## Monorepo layout

| Directory | Role |
|-----------|------|
| `frontend/` | Vite + React + TS, Tailwind, Redux Toolkit + RTK Query |
| `backend/` | Express + TS — PDF processing, signing orchestration, download tokens |
| `helper-agent/` | Local PKCS#11 signing agent (Phase 1 stub, separate installer) |
| `docs/` | Architecture deep-dives |

## How to run

```bash
# Backend  (port 4000)
cd backend && npm run dev

# Frontend (port 5173, proxies /api → 4000)
cd frontend && npm run dev

# Helper agent stub (port 17357)
cd helper-agent && npm run dev
```

## Phase status (as of last commit)

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Upload → viewer → draw signature box → appearance config → mock sign → gated download |
| 1 | ✅ Done | Real PAdES via PKCS#11 local helper agent (smart card, Windows) — signs with PIN, verified against eIDAS validation site |
| 2 | ❌ Abandoned | Rewarded ads (GAM). Decision: dropped in favor of an account + signature-credit model — see Phase 2´ and `docs/ACCOUNTS.md` |
| 2´ | 🔨 In progress | Milestone 1 **done & verified E2E**: Supabase Auth (email+parola и Google OAuth), 5 credits при регистрация, атомарен дебит при download, preview + безплатно повторно изтегляне, TTL чистач. Pending: paid packages (Stripe), business subscriptions + stamp. See `docs/ACCOUNTS.md` |
| 3 | ⏸ On hold | Cloud QES — Evrotrust REST API via `CloudSignerProvider` (deprioritized, not currently planned) |
| 4 | ⏸ On hold | B-Trust cloud QES (deprioritized, not currently planned) |
| 5 | 🔲 — | PAdES B-T/B-LT (timestamps), i18n |

## Accounts & Credits (Phase 2´)

Replaces the ad-gated download model from Phase 0. Full design in `docs/ACCOUNTS.md`; summary:

- **Signing stays open; downloading is gated.** Anyone can upload and run `/sign/prepare` / `/sign/complete` without an account. The download page always renders a preview of the signed PDF. The **download itself** requires the user to be logged in **and** to hold at least 1 signature credit (or hold a business subscription).
- **Credit debit happens at download time, not at sign time** — 1 credit is debited per signed document, at download-token issuance (`POST /download/request`). Re-downloads with the same token are free (retry after an interrupted stream); files live max 1 h after upload (TTL sweeper).
- **New accounts start with 5 free credits.**
- **Paid packages:** 50 credits for €2.90, one-time purchase, credits do not expire.
- **Business accounts:** monthly subscription, unlimited signature credits (no debit), and can upload/store a custom stamp image (печат) reused across documents.
- Credit balance checks + debits must be an atomic server-side operation (DB transaction) to avoid race conditions from parallel download requests.

## Critical architectural constraints

- **PAdES must be applied server-side.** The byte-range hash and placeholder injection require controlled access to the full PDF byte stream. Client-side signing is not possible.
- **Private keys never leave the smart card.** The helper agent performs `signHash(hash)` on-card via PKCS#11 and returns only the detached CMS blob.
- **Download is gated by a server-signed JWT.** The token is issued only after the backend verifies the user is authenticated and has debited an available signature credit (or holds a business subscription). Client-side button hiding is not sufficient. (This replaces the old ad-watched gate from Phase 0/2 — see "Accounts & Credits" above.)
- **Cyrillic text in PDFs requires a custom TTF.** pdf-lib's `StandardFonts` (Helvetica etc.) are WinAnsi-only. The backend uses the bundled `backend/assets/fonts/NotoSans-Regular.ttf` (needed on bare containers like Railway), with OS fonts as fallback. See `backend/src/services/pdf/fonts.ts`.
- **Coordinate system inversion.** pdf.js renders top-left origin; pdf-lib uses bottom-left origin. The transform is isolated in `frontend/src/lib/coords.ts` — do not inline this math elsewhere.

## Key extension points (adding Phase N features)

- **New signing provider (cloud):** implement `CloudSignerProvider` interface → add to `backend/src/services/providers/` (on hold, not currently planned — see Phase 3/4).
- **New payment provider (packages / subscriptions):** implement a `PaymentProvider` interface (e.g. Stripe) for one-time package purchases and business monthly billing → replaces the abandoned `AdProvider`/`AdVerifier` extension point.
- **New local signing provider:** implement `LocalSigningProvider` interface in helper-agent → swap via config.

## CI / Release

Helper-agent installers are built and published automatically via GitHub Actions.

**To release a new version:**
```bash
git tag helper-agent-v0.x.0
git push origin helper-agent-v0.x.0
```

The workflow (`.github/workflows/build-helper-agent.yml`) runs three parallel jobs — `windows-2022`, `ubuntu-latest`, `macos-latest` — and uploads the artifacts as GitHub Release assets. Installer download URLs in `frontend/src/lib/detectOS.ts` point directly to `github.com/eomayski/Easy-PDF-Sign/releases/latest/download/`.

The workflow can also be triggered manually from the Actions tab (without creating a tag) to produce build artifacts without a public release.

## Where to find things fast

| What | Where |
|------|-------|
| Signing flow details | `docs/SIGNING_FLOW.md` |
| Accounts, credits & billing plan | `docs/ACCOUNTS.md` |
| Deployment plan (Railway / Vercel / Supabase) | `docs/DEPLOYMENT.md` |
| Viewport→PDF coordinate transform | `frontend/src/lib/coords.ts` |
| API contract | `docs/API.md` |
| Job state machine | `backend/src/store/jobs.ts` |
| Visual signature rendering | `backend/src/services/pdf/visualSignature.ts` |
| Provider interfaces | `backend/src/services/providers/` |
| Redux state shape | `frontend/src/store/` |
| UI primitives | `frontend/src/components/ui/` |
| Feature modules | `frontend/src/features/{upload,viewer,signature-box,sign-config,signing,download}/` |
| Installer download URLs | `frontend/src/lib/detectOS.ts` → `getHelperDownloads()` |
| CI release workflow | `.github/workflows/build-helper-agent.yml` |

## .env for backend

Copy `backend/.env.example` → `backend/.env`. For Phase 0 only `PORT`, `UPLOAD_DIR`, and `DOWNLOAD_TOKEN_SECRET` are needed.
