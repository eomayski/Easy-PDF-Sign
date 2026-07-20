# Easy PDF Sign

**Подписвайте PDF документи с квалифициран електронен подпис (КЕП) — направо в браузъра.**

A web app for signing PDF documents with a **Qualified Electronic Signature** (QES, PAdES / eIDAS), aimed at the Bulgarian / EU market. Upload a PDF, draw where the signature should appear, sign with your smart-card certificate through a small local helper agent, preview the result, and download the signed file.

🔗 **Live:** [pdf-easy.online](https://pdf-easy.online/)

## How it works

```
Browser ──► Backend (Express)          Helper Agent (localhost)
  │            │                              │
  │  upload    │  pdf-lib: visual stamp       │
  │  ────────► │  PAdES placeholder + hash    │
  │            │  ────── byteRangeHash ─────► │  PKCS#11: sign on card
  │            │  ◄────── detached CMS ────── │  (PIN via OS dialog)
  │  download  │  embed CMS → signed PDF      │
```

- **The private key never leaves the smart card.** The helper agent only performs `C_Sign` over a SHA-256 hash via PKCS#11 and returns the detached CMS blob. The PIN is entered in an OS dialog and never crosses HTTP.
- **PAdES is applied server-side** (byte-range hashing requires control over the full PDF byte stream). Signatures validate as `TOTAL-PASSED` against the [EU DSS validator](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation).
- **Signing is open, downloading is gated.** Anyone can sign; downloading the result requires an account with signature credits (5 free on signup). Files are deleted from the server at most 1 hour after upload (GDPR).

## Monorepo

| Directory | What it is |
|-----------|------------|
| [`frontend/`](frontend/) | Vite + React + TypeScript, Tailwind, Redux Toolkit / RTK Query |
| [`backend/`](backend/) | Express + TypeScript — PDF processing, PAdES orchestration, credits, download tokens (Prisma + Postgres) |
| [`helper-agent/`](helper-agent/) | Local PKCS#11 signing agent (Node, packaged as native installers) |
| [`docs/`](docs/) | Architecture deep-dives: [signing flow](docs/SIGNING_FLOW.md), [API](docs/API.md), [accounts & credits](docs/ACCOUNTS.md), [deployment](docs/DEPLOYMENT.md) |

Auth is handled by Supabase (email + password and Google OAuth); the backend verifies the Supabase JWT and owns the credit ledger with atomic debits.

## Helper agent installers

Built by CI for Windows (`.exe`), Linux (`.deb` / `.rpm`) and macOS — see [Releases](../../releases). The agent listens only on `127.0.0.1:17357` and accepts requests solely from an explicit origin allowlist.

## Run locally

```bash
# Backend (port 4000) — copy backend/.env.example → backend/.env first
cd backend && npm install && npx prisma migrate dev && npm run dev

# Frontend (port 5173, proxies /api → 4000) — copy frontend/.env.example → frontend/.env.local
cd frontend && npm install && npm run dev

# Helper agent (port 17357; smart card optional for dev)
cd helper-agent && npm install --ignore-scripts && npm run dev
```

You'll need a (free) [Supabase](https://supabase.com) project for auth + Postgres — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Status

Working today: end-to-end QES signing with physical smart cards (verified against the eIDAS validation suite), accounts, signature credits, gated downloads. In progress: paid credit packages (Stripe) and business subscriptions. See the phase table in [CLAUDE.md](CLAUDE.md).

## License

Source-available for transparency — especially so you can audit what the helper agent does with your smart card. **No license is granted** for reuse, redistribution, or derivative works. All rights reserved.

© 2026 Emil Omayski (Емил Омайски).
