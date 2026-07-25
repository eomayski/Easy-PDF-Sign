# Accounts & Credits (Phase 2´)

Status: **Milestone 1 implemented & verified E2E** (2026-07-04) — Supabase Auth
(email+password + Google OAuth), signup bonus, atomic download debit, free re-download,
TTL cleanup. **Milestone 2: Stripe payments implemented** (2026-07-10) — credit packages,
business subscriptions (€5.99/mo) and the Customer Portal via `StripePaymentProvider`;
awaiting live Stripe keys + E2E verification. **Still pending:** business stamp upload
(`POST /account/stamp`). This replaces the abandoned Phase 2 rewarded-ads plan (GAM).
See the Phase table in `CLAUDE.md`.

## Why

Rewarded ads (Phase 2) were dropped. Downloads are now monetized directly through
user accounts and a signature-credit balance instead of an ad watch.

## Core rule

Signing stays free and open to everyone — no account is required to upload a PDF (up to the
free size tier, see below), place a signature box, configure its appearance, or run
`/sign/prepare` / `/sign/complete`. The download page always renders a **preview** of the
signed PDF regardless of auth state.

Only the **download** of the final signed PDF is gated, on two conditions:
1. The user is logged in.
2. The user has at least 1 signature credit available (or holds an active business subscription).

The one exception to "uploading is free" is **file size** — see the next section.

## Upload size fees

Large files cost real disk and processing, and that cost is incurred at **upload** time — so
unlike the download credit, the size fee is charged there.

| File size | Account | Cost |
|-----------|---------|------|
| ≤ `FREE_UPLOAD_SIZE_MB` (default 5 MB) | not required | free — unchanged behaviour |
| > 5 MB, ≤ `MAX_UPLOAD_SIZE_MB` (default 200 MB) | **required** | 1 credit per started `CREDIT_STEP_SIZE_MB` (default 5 MB) above the free tier |
| > `MAX_UPLOAD_SIZE_MB` | — | rejected for everyone, an abuse valve |

```
creditsRequired = size <= FREE ? 0 : ceil((size - FREE) / STEP)
```

Examples with the defaults: 5 MB → 0 · 5 MB + 1 B → 1 · 6 MB → 1 · 10 MB → 1 ·
10 MB + 1 B → 2 · 23 MB → 4.

- The size fee is **additional to and separate from** the download debit: a 12 MB document
  costs 2 credits to upload plus 1 credit to download. Both come out of the same balance.
- **Business subscriptions pay no size fee**, matching the existing "unlimited signatures"
  rule — `hasActiveBusinessSubscription()` skips the debit exactly as it does for downloads.
  The hard cap still applies to them.
- Recorded in the ledger as `upload_size_fee`, so users can tell it apart from
  `download_debit` in their history.

### Atomicity and refunds

The balance check, the decrement and the ledger row are one Prisma transaction, using the same
conditional `credits >= n` update as `debitCreditForDownload()` — two parallel uploads cannot
both spend the same credit.

Jobs still live in memory (`backend/src/store/jobs.ts`), so the debit and the upload
registration cannot literally share one transaction. Instead the pair is completed by
compensation: if anything after the debit fails (PDF parsing, job creation), the credits are
returned with an `upload_size_refund` ledger row, the temp file is unlinked, and the refund is
logged. A failed upload therefore never burns credits.

Configured entirely by env (`FREE_UPLOAD_SIZE_MB`, `CREDIT_STEP_SIZE_MB`,
`MAX_UPLOAD_SIZE_MB`), mirrored to the browser as `VITE_*` so the UI can quote the price
before the upload starts. Error codes are in `docs/API.md` under `POST /upload`.

## Account types

### Free (default on signup)
- 5 signature credits granted at registration.
- Can buy packages: **50 credits for €2.99**, one-time purchase, credits do not expire.
- 1 credit is debited per successful document download.

### Business
- Monthly subscription: **€5.99/month** (recurring billing, decided 2026-07-10).
- Unlimited signature credits — no per-download debit while the subscription is active.
- Can upload and persist a custom stamp/seal image (печат) reused as the default visual
  signature stamp across documents (extends the existing `visualConfig.imageDataUrl`
  concept in `POST /sign/prepare` — for business accounts this can be pre-filled from the
  stored stamp instead of re-uploaded every time).

## Where the credit is debited

The credit is consumed **at download time**, not at sign time. This means:
- A user can sign a document without being logged in or having credits, and only needs
  to authenticate + pay when they actually want the final file.
- The debit + balance check must happen as a single atomic server-side operation (DB
  transaction / row lock) inside the handler that used to be `/api/ads/confirm-view` and
  is now `/api/download/request`, to avoid a race where two concurrent requests both read
  a balance of 1 and both succeed.
- Business accounts skip the debit entirely (checked via `accountType` + active
  subscription status, not a credit count).

See the request/response shape in `docs/API.md` under "Accounts & Credits".
See the full flow diagram in `docs/SIGNING_FLOW.md` under "Phase 2´ — Accounts & Credits gating".

## Data model (sketch)

Replaces the in-memory `backend/src/store/jobs.ts` model with a real DB (Prisma
recommended, matching the existing TS/Express stack) for at least:

```
User {
  id
  email (unique)
  // no passwordHash — credentials live in Supabase Auth (auth.users); our id mirrors its sub claim
  accountType: "free" | "business"
  credits: number                 // ignored/unused for "business"
  subscriptionStatus?: "active" | "past_due" | "canceled"
  subscriptionRenewsAt?: DateTime
  stampImageUrl?: string           // business only
  createdAt
}

CreditTransaction {
  id
  userId
  delta: number        // +5 signup bonus, +50 package purchase, -1 download debit,
                       // -N upload size fee, +N its refund
  reason: "signup_bonus" | "package_purchase" | "download_debit"
        | "upload_size_fee" | "upload_size_refund" | "refund"
  jobId?: string        // for download_debit, upload_size_fee, upload_size_refund
  createdAt
}
```

`CreditTransaction` gives an audit trail — important given this is a paid product and
disputes/refunds will happen.

## Payment provider

Extension point (replaces the abandoned `AdProvider`/`AdVerifier` pair), **implemented
2026-07-10** with Stripe hosted Checkout — see
`backend/src/services/billing/PaymentProvider.ts` (interface) and
`StripePaymentProvider.ts` (implementation). Key mechanics:

- Checkout/portal endpoints only mint a redirect URL; **fulfilment happens exclusively in
  the webhook** (`POST /api/billing/webhook`, raw-body signature verification).
- Package credit grants are idempotent: the Stripe event id is stored on
  `CreditTransaction.stripeEventId` (unique) so webhook retries can't double-credit.
- Subscription state is a pure projection of the Stripe subscription object
  (`accountType`, `subscriptionStatus`, `subscriptionRenewsAt`), safe under retries and
  out-of-order delivery. Cancellation demotes the account back to `free` (existing
  credits are kept).
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CREDITS_50`,
  `STRIPE_PRICE_BUSINESS_MONTHLY`. All lazily read — the backend boots and everything
  else works without them (billing endpoints return `503`).

The interface stays provider-agnostic in case a Bulgarian/EU processor is preferred later.

## Open questions / not yet decided

- ~~Auth mechanism specifics~~ — **decided (2026-07-03): Supabase Auth.** Frontend uses
  `@supabase/supabase-js` (register/login/reset/verification out of the box); backend
  verifies the Supabase-issued JWT in an Express middleware and keeps credits in the same
  Supabase Postgres via Prisma. See `docs/DEPLOYMENT.md`.
- Whether package credits ever expire (currently: no).
- ~~Refund/edge-case handling if a download debit succeeds but the stream fails~~ —
  **resolved (2026-07-04):** the download token is reusable while valid; the debit happens
  once at token issuance and re-downloads are free. Files are kept until the job TTL instead
  of being deleted right after the first download, and issuing the token extends that TTL to
  at least the token's own lifetime — a file the user has paid a credit for must never be
  swept while its token is still valid.
- VAT invoicing requirements for EU consumers (Bulgaria-based seller, EU-wide buyers).
- Whether anonymous (pre-login) jobs get associated with a user retroactively after they
  log in mid-flow, or whether login must happen before the download page is reached.
