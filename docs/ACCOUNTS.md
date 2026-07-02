# Accounts & Credits (Phase 2´)

Status: **planned, not yet implemented.** This replaces the Phase 2 rewarded-ads plan
(GAM), which has been abandoned. See the Phase table in `CLAUDE.md`.

## Why

Rewarded ads (Phase 2) were dropped. Downloads are now monetized directly through
user accounts and a signature-credit balance instead of an ad watch.

## Core rule

Signing stays free and open to everyone — no account is required to upload a PDF, place
a signature box, configure its appearance, or run `/sign/prepare` / `/sign/complete`.
The download page always renders a **preview** of the signed PDF regardless of auth state.

Only the **download** of the final signed PDF is gated, on two conditions:
1. The user is logged in.
2. The user has at least 1 signature credit available (or holds an active business subscription).

## Account types

### Free (default on signup)
- 5 signature credits granted at registration.
- Can buy packages: **50 credits for €2.90**, one-time purchase, credits do not expire.
- 1 credit is debited per successful document download.

### Business
- Monthly subscription (recurring billing).
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
  passwordHash
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
  delta: number        // +5 signup bonus, +50 package purchase, -1 download debit
  reason: "signup_bonus" | "package_purchase" | "download_debit" | "refund"
  jobId?: string        // for download_debit
  createdAt
}
```

`CreditTransaction` gives an audit trail — important given this is a paid product and
disputes/refunds will happen.

## Payment provider

New extension point (replaces the abandoned `AdProvider`/`AdVerifier` pair):

```ts
interface PaymentProvider {
  createPackageCheckout(userId, package: "50-credits"): Promise<{ checkoutUrl: string }>;
  createSubscriptionCheckout(userId): Promise<{ checkoutUrl: string }>;
  handleWebhook(payload, signature): Promise<PaymentEvent>; // credits packages / subscription renewals / cancellations
}
```

Stripe is the natural default (SCA/3-D Secure support for EU cards, EUR pricing, hosted
Checkout, subscription billing, webhooks) but the interface should stay provider-agnostic
in case a Bulgarian/EU processor is preferred later. Implement under
`backend/src/services/billing/`.

## Open questions / not yet decided

- Auth mechanism specifics (session cookie vs JWT, password reset flow, email verification).
- Whether package credits ever expire (currently: no).
- Refund/edge-case handling if a download debit succeeds but the actual file stream fails.
- VAT invoicing requirements for EU consumers (Bulgaria-based seller, EU-wide buyers).
- Whether anonymous (pre-login) jobs get associated with a user retroactively after they
  log in mid-flow, or whether login must happen before the download page is reached.
