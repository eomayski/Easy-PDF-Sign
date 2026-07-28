# Frontend — Agent Context

Vite + React 18 + TypeScript. Tailwind CSS. Redux Toolkit + RTK Query.

## Run

```bash
npm run dev    # port 5173; /api proxied to backend:4000
npm run build  # tsc + vite build → dist/
```

## UX flow

```
/      Landing     → LandingPage (marketing page + pinned-scroll demo of the flow)
/sign  Step 0      → UploadStep
       Step 1      → ViewerStep (pdf.js + SignatureBox overlay)
       Step 2      → SignConfigStep (appearance)
       Step 3      → SigningStep
       Step 4      → DownloadStep
```

Routing is react-router-dom (`BrowserRouter` in `main.tsx`): `/` is the landing page, `/sign` is the signing flow, everything else redirects to `/`. The header brand links to `/`. If a persisted flow is restored after a full reload (OAuth redirect / F5), `App.tsx` navigates straight to `/sign`. The current step lives in `App.tsx` (local useState) so it survives landing↔flow navigation. Cross-step data (`placement`, `visualConfig`, `downloadToken`) is passed as props. Redux handles server-derived state. Production needs the SPA fallback rewrite in `vercel.json` (`/:path*` → `/index.html`).

## i18n (BG/EN)

`src/i18n/` — i18next with typed dictionaries (`bg.ts` is the schema source, `en.ts` is typed against it, so a missing key fails `tsc`). All UI strings go through `t('...')` — never hardcode user-facing text in components. `LanguageSwitcher` (header) persists the choice in localStorage (`eps-lang`); default follows the browser language. The visual signature content in PDFs stays English by design (`Digitally signed by: ...`).

## Redux store shape

```
store/
  api          RTK Query endpoints (prepareSign, completeSign, getMe, requestDownload,
                 discardJob — DELETE /jobs/:id, fired from App.tsx handleReset)
                — upload is NOT here: it uses XHR for real progress (lib/uploadWithProgress.ts)
                — prepareHeaders attaches the Supabase Bearer token automatically
                — billing endpoints (purchaseCredits, subscribeBusiness, billingPortal)
                  връщат URL за пълен redirect към Stripe
  upload       { jobId, numPages, fileName }
  signing      { method, status, byteRangeHash, errorMessage }
  auth         { user: { userId, email, accountType, credits } | null, sessionChecked,
                 syncing, passwordRecovery, hasPasswordIdentity }
```

## Feature modules (`src/features/`)

| Directory | Key files | Responsibility |
|-----------|-----------|----------------|
| `landing/` | `LandingPage.tsx`, `landing.css` | Marketing landing: hero with animated ink stroke, pinned scroll section replaying the 5 steps as HTML mock-ups, pricing, CTA. Copy lives in the `landing.*` i18n keys |
| `upload/` | `UploadStep.tsx`, `uploadSlice.ts` | Drag-drop or browse; POST to /api/upload with a real progress bar. Files above the free size tier are quoted (credit cost) or prompted for login **before** the upload starts — see "Upload size policy" below |
| `viewer/` | `PdfViewer.tsx`, `ViewerStep.tsx` | pdf.js rendering; page navigation |
| `signature-box/` | `SignatureBox.tsx` | Konva canvas overlay; draw + resize + drag rectangle |
| `sign-config/` | `SignConfigStep.tsx`, `HandwrittenSignatureModal.tsx` | Appearance options; signature_pad canvas |
| `signing/` | `SigningStep.tsx`, `signingSlice.ts` | Method picker; orchestrates prepare → (agent) → complete. Does NOT mint the download token — that moved to DownloadStep (Phase 2´) |
| `auth/` | `AuthModal.tsx`, `AccountWidget.tsx`, `authSlice.ts`, `useSupabaseSession.ts` | Login/register (email+password + Google OAuth via Supabase), forgotten-password + set-new-password flows, header dropdown menu (email, credits → BillingModal, change password, logout) |
| `billing/` | `BillingModal.tsx`, `BillingReturnBanner.tsx` | Stripe покупки: modal с пакета (€2.99) и business абонамента (€5.99/мес) → redirect към hosted Checkout; за business — Customer Portal. Банерът чете `?billing=success\|cancelled` при връщането и опреснява баланса със закъснение (webhook-ът начислява кредитите) |
| `download/` | `DownloadStep.tsx`, `SignedPdfPreview.tsx` | pdf.js canvas preview (always visible); download button calls `requestDownload` (401 → AuthModal, 402 → upsell modal). Token cached in sessionStorage — re-downloads are free |

## Accounts & Credits (Phase 2´ — milestone 1 implemented)

Full design in `docs/ACCOUNTS.md`. Implementation notes:

- Supabase client in `src/lib/supabase.ts` (env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; null-safe when unset). `useSupabaseSession()` (called in `App.tsx`) syncs the Supabase session → `GET /auth/me` → `auth` slice.
- `AuthModal` has three views in one component: the login/register tabs, an email-only **forgotten password** form (`resetPasswordForEmail` with `redirectTo: window.location.origin` — the origin must be in the Supabase Redirect URLs), and `mode="reset"` — new password + confirmation via `supabase.auth.updateUser({ password })`.
- The reset view opens automatically when the app is loaded from a recovery link. `src/lib/recovery.ts` reads `type=recovery` from the URL **at import time** (before supabase-js clears it) and exposes `consumeRecoveryFlag()` — one-shot on purpose, otherwise every later sign-in in the same tab would re-open the modal. `useSupabaseSession` also handles the `PASSWORD_RECOVERY` event (implicit links only; PKCE links arrive as `SIGNED_IN`, hence the URL flag).
- `auth.hasPasswordIdentity` (derived from `session.user.identities`) hides "change password" for Google-only accounts, which have no password to change.
- **Google OAuth runs in a separate tab** (`src/lib/oauthTab.ts`), so the current page is never
  torn down and in-memory state (notably a chosen `File`) survives. Google's consent screen
  refuses to be framed, so a top-level navigation somewhere is unavoidable — a second tab is where
  it does no damage. Mechanics:
  - `openBlankAuthTab()` must be called **synchronously in the click handler**, before any
    `await` — otherwise the popup blocker kills it. Tabs and popups go through the *same* blocker;
    what matters is the user activation, not the window type. No window features are passed, so
    the browser makes a tab (on mobile it would be a tab regardless).
  - `signInWithOAuth({ skipBrowserRedirect: true })` returns the URL, which is then assigned to
    the new tab.
  - Nothing needs to be posted back: supabase-js keeps a `BroadcastChannel` named after its
    `storageKey` and re-emits auth events to every tab of the origin, so `useSupabaseSession` in
    the original tab receives `SIGNED_IN` on its own.
  - The auth tab identifies itself with a **per-tab `sessionStorage` marker** written while it is
    still `about:blank`. `window.name` is only a fallback because browsers clear it on
    cross-origin navigation (Chrome 88+, anti-tracking). `window.opener` is deliberately *not*
    used: a site opened via `target="_blank"` has a non-null opener, and on the redirect fallback
    that would make us close the user's main tab.
  - `main.tsx` short-circuits before rendering React when it detects that tab: it waits for the
    session, then `window.close()`. On timeout/denial it renders the app normally so no blank tab
    is left behind.
  - If `window.open` returns `null` (blocker, or an in-app webview such as Facebook's, where the
    opened context may not even share storage), it falls back to the old full-page redirect, and
    `src/lib/flowPersistence.ts` restores the flow (sessionStorage: step, upload info, placement,
    visualConfig). That path also makes F5 survivable.
  - `redirectTo` stays at the bare origin on purpose — a path would also have to be in the
    Supabase Redirect URLs allow-list.
- Payments (Stripe) implemented — see the `billing/` module above. Pending: custom stamp upload for business accounts.

## Upload size policy

`src/lib/uploadPolicy.ts` mirrors `backend/src/config/uploadPolicy.ts` (env:
`VITE_FREE_UPLOAD_SIZE_MB`, `VITE_CREDIT_STEP_SIZE_MB`, `VITE_MAX_UPLOAD_SIZE_MB`; same
defaults 5/5/200). It exists **only** to quote the cost before the upload starts — the backend
re-checks and is the authority. Keep the two in sync when the defaults change.

**Login must not interrupt the upload.** When an oversized file sends the user to the login
screen, `UploadStep` keeps the `File` in state and also stores its name/size via
`savePendingUpload()` (`lib/flowPersistence.ts`, 30 min TTL):

- **Email+password** (no reload) — the `File` is still in memory, so the upload **starts
  automatically** once the session lands. The price was already shown before login, so there is
  no second confirmation.
- **Google OAuth** — runs in a **separate tab** (`src/lib/oauthTab.ts`) precisely so this page is
  never torn down and the `File` survives; the same auto-continue then applies. See below.
- **Google OAuth fallback** (tab blocked → full reload) — a `File` cannot survive a reload, so
  only the intent is restored: `App.tsx` navigates back to `/sign` when a pending upload exists
  (instead of leaving the user on the landing page), and `UploadStep` shows a "you're signed in,
  pick «name» again" panel with the quoted cost.

`src/lib/uploadWithProgress.ts` attaches the Supabase bearer token (files above the free tier
are charged, so the upload must be attributable) and rejects with an `UploadError` carrying the
structured `code` from the API (`FILE_TOO_LARGE_LOGIN_REQUIRED` → AuthModal,
`INSUFFICIENT_CREDITS` → BillingModal upsell with `required`/`available`,
`FILE_EXCEEDS_HARD_CAP` → inline error). Full contract in `docs/API.md`.

## Coordinate system — important

pdf.js renders with **top-left origin** (browser). pdf-lib and PAdES use **bottom-left origin** (PDF spec). Y-axis is inverted.

**All coordinate transforms must go through `src/lib/coords.ts`:**

```ts
viewportToPdfRect(rect, scale, pageHeightPt)  // use before sending to backend
pdfRectToViewport(rect, scale, pageHeightPt)  // use when restoring a saved rect
```

Never inline the Y-flip math in components.

## pdf.js worker setup

`PdfViewer.tsx` configures the worker via Vite's `?url` import:

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;
```

This is resolved correctly by Vite for both dev and production builds.

## UI primitives (`src/components/ui/`)

`Button`, `Card`, `Modal`, `Spinner`, `Stepper` — all Tailwind-only, no external component library. Extend here before reaching for a library.

## Design tokens

Defined in `tailwind.config.ts`. Key tokens:
- Primary: `brand-{50..900}` (indigo family)
- Use token classes (`bg-brand-600`) not hardcoded hex in components.

## Helper agent installer downloads

`src/lib/detectOS.ts` exports `detectOS()` and `getHelperDownloads(os)`. These are used in `SigningStep.tsx` to show OS-specific download links when the helper agent is not detected.

Download URLs point to GitHub Releases (`releases/latest/download/`), not to the backend's `/downloads/` route. To update the URLs, edit the `RELEASES_BASE` constant in `detectOS.ts`.

`LATEST_HELPER_VERSION` (used for the "new version available" banner) is **not** hardcoded — `vite.config.ts` reads `helper-agent/package.json` at build time and injects it as `__HELPER_VERSION__` (declared in `src/vite-env.d.ts`). Bump the version only in `helper-agent/package.json`. If that file is unreachable during the build, the fallback `0.0.0` disables the banner instead of showing a stale version.

macOS ships an unsigned `.pkg` installer, so `getHelperDownloadHint('macos')` adds a Gatekeeper note ("right-click → Open") under the download button.

## Physical signing (Phase 1 — complete)

The physical flow is fully working end-to-end in `SigningStep.tsx` (cert picker modal, agent calls, complete sign). It is gated by `agentStatus === 'available'` — the button is disabled until the helper agent's `/health` responds.
