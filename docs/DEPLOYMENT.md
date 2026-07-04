# Deployment

Status: **decided 2026-07-03; not yet executed.** Prereqs done (2026-07-04): Supabase
project live (auth incl. Google OAuth + Postgres, migration applied), backend build runs
`prisma generate`, frontend env uses the publishable key.

## Stack decision

| Piece | Where | Plan / cost |
|-------|-------|-------------|
| Backend (Express) | **Railway** — `https://easy-pdf-sign-production.up.railway.app` | 30-day trial ($5 one-time credit), then **Hobby $5/mo** (includes $5 usage credit) |
| Frontend (Vite static build) | **Vercel** — `https://easy-pdf-sign-nine.vercel.app` | Free (Hobby) |
| Auth + Postgres (Phase 2´) | **Supabase** | Free tier; pick **EU region (Frankfurt)** for GDPR data residency |
| Helper agent installers | GitHub Releases | Already in place (`.github/workflows/build-helper-agent.yml`) |

Why not alternatives considered:
- **Firebase Functions rewrite** — rejected. The PAdES flow is stateful (PDF must survive on disk between `/sign/prepare` and `/sign/complete`); rewriting the eIDAS-verified signing code for a stateless FaaS runtime buys nothing.
- **SuperHosting shared hosting** — Node.js turned out to be available only on their VPS/managed plans, not on the shared plan we already pay for.
- **Render** — real free tier but cold starts (~30–60 s after 15 min idle) and the $7/mo paid tier loses to Railway's $5.
- **Hetzner VPS** — cheapest raw compute (~€5.5/mo incl. VAT) but unmanaged (OS updates, security are on us).

---

## Backend → Railway

1. New Railway project → "Deploy from GitHub repo" → select `eomayski/Easy-PDF-Sign`.
2. Service settings:
   - **Root Directory:** `backend`
   - Build: auto-detected (`npm install && npm run build`)
   - **Start command:** `npm start` (runs `node dist/index.js`)
3. Environment variables:

| Var | Value in production |
|-----|--------------------|
| `PORT` | Railway injects `PORT` automatically — the server must bind to it |
| `UPLOAD_DIR` | `./uploads` (ephemeral, see below) |
| `DOWNLOAD_TOKEN_SECRET` | long random string (`openssl rand -hex 32`) — **never reuse the dev value** |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | `3600` |
| `FRONTEND_ORIGIN` | the Vercel production URL (e.g. `https://easy-pdf-sign.vercel.app`) |
| `DATABASE_URL` | Supabase Postgres connection string (Phase 2´, when Prisma lands) |

4. Every `git push` to `main` auto-deploys.

**Ephemeral filesystem:** Railway wipes local disk on each redeploy. This is acceptable — uploaded/signed PDFs live only minutes and are deleted after download anyway (GDPR). Consequence: a job that is mid-flow during a redeploy is lost; the user re-uploads. The in-memory job store (`backend/src/store/jobs.ts`) has the same property. When Phase 2´ moves jobs to Postgres, only the PDF bytes remain ephemeral.

---

## Frontend → Vercel

The frontend calls the API with relative paths (`/api/...` — see `frontend/src/store/api.ts`, `baseUrl: '/api'`). In dev, Vite proxies this to `:4000`. In production, replicate that with **Vercel rewrites** instead of introducing a `VITE_API_URL` — no code change, no CORS, same-origin cookies work if we ever need them.

1. Vercel → "Add New Project" → import the GitHub repo.
   - **Root Directory:** `frontend`
   - Framework preset: Vite (build `npm run build`, output `dist`) — auto-detected.
2. Add `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<railway-backend-domain>/api/:path*" },
    { "source": "/downloads/:path*", "destination": "https://<railway-backend-domain>/downloads/:path*" }
  ]
}
```

Replace `<railway-backend-domain>` with the domain Railway assigns (Settings → Networking → Generate Domain), or a custom `api.` subdomain later.

3. Every push to `main` auto-deploys; PRs get preview URLs.

---

## Auth + database → Supabase (Phase 2´)

Decision for the "auth mechanism" open question in `docs/ACCOUNTS.md`: **Supabase Auth**, one project providing both auth and the Postgres that Prisma will use for `User` / `CreditTransaction` / jobs.

- Create the project in **eu-central (Frankfurt)**.
- **Frontend:** `@supabase/supabase-js` handles register/login/password reset. Needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_...` key; public, safe to expose).
- **Backend:** stays the source of truth for credits. It does **not** use the Supabase client for auth — it just verifies the Supabase-issued JWT from the `Authorization: Bearer` header in an Express middleware, then trusts `sub` as the user id. Credit debit remains an atomic Postgres transaction via Prisma (see `docs/ACCOUNTS.md`, "Where the credit is debited").
- **Prisma:** two connection strings (Dashboard → Connect → ORMs → Prisma): `DATABASE_URL` = transaction pooler (`:6543`, `?pgbouncer=true`) for runtime, `DIRECT_URL` = session pooler (`:5432`) for migrations. Supabase's `auth.users` is managed by Supabase; our `User` row references it by id and holds `accountType`, `credits`, etc.

---

## Helper agent — production origin

The installed agent enforces CORS via `APP_ORIGIN` (see `helper-agent/.env.example`, default `http://localhost:5173`). Before pointing real users at the production site, release a new agent version whose default `APP_ORIGIN` includes the production frontend URL, otherwise the browser cannot reach `http://127.0.0.1:17357` from the deployed app. Also note the pending TODO: TLS on localhost (`mkcert`) — browsers may block `http://127.0.0.1` calls from an `https://` page in some configurations (mixed-content rules treat loopback as potentially trustworthy, but verify per-browser).

---

## Go-live checklist

- [ ] Railway service up, `/api/health` reachable on the Railway domain
- [ ] Strong `DOWNLOAD_TOKEN_SECRET` set in Railway (not the dev value)
- [ ] `FRONTEND_ORIGIN` set to the Vercel URL
- [ ] `frontend/vercel.json` rewrites point at the Railway domain
- [ ] Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Supabase → Authentication → URL Configuration: **Site URL** = Vercel domain; add it to **Redirect URLs** too (keep `http://localhost:5173` for dev)
- [ ] Google OAuth consent screen published (test mode only allows whitelisted users)
- [ ] Supabase custom SMTP configured (built-in sender is ~2 emails/hour — fine for dev, not for real users)
- [ ] Full flow works on the production URLs: регистрация → 5 credits → mock sign → preview → download → free re-download
- [ ] Helper-agent release with production `APP_ORIGIN`; physical signing verified from the production site
- [x] Supabase project in Frankfurt, `DATABASE_URL`/`DIRECT_URL` wired, JWT middleware in place, migration `phase2_users_credits` applied
