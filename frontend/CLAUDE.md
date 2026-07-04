# Frontend — Agent Context

Vite + React 18 + TypeScript. Tailwind CSS. Redux Toolkit + RTK Query.

## Run

```bash
npm run dev    # port 5173; /api proxied to backend:4000
npm run build  # tsc + vite build → dist/
```

## 4-step UX flow

```
Step 0: Upload     → UploadStep
Step 1: Place      → ViewerStep (pdf.js + SignatureBox overlay)
Step 2: Appearance → SignConfigStep
Step 3: Sign       → SigningStep
Step 4: Download   → DownloadStep
```

State for the current step lives in `App.tsx` (local useState). Cross-step data (`placement`, `visualConfig`, `downloadToken`) is passed as props. Redux handles server-derived state.

## Redux store shape

```
store/
  api          RTK Query endpoints (uploadPdf, prepareSign, completeSign, getMe, requestDownload)
                — prepareHeaders attaches the Supabase Bearer token automatically
  upload       { jobId, numPages, fileName }
  signing      { method, status, byteRangeHash, errorMessage }
  auth         { user: { userId, email, accountType, credits } | null, sessionChecked }
```

## Feature modules (`src/features/`)

| Directory | Key files | Responsibility |
|-----------|-----------|----------------|
| `upload/` | `UploadStep.tsx`, `uploadSlice.ts` | Drag-drop or browse; POST to /api/upload |
| `viewer/` | `PdfViewer.tsx`, `ViewerStep.tsx` | pdf.js rendering; page navigation |
| `signature-box/` | `SignatureBox.tsx` | Konva canvas overlay; draw + resize + drag rectangle |
| `sign-config/` | `SignConfigStep.tsx`, `HandwrittenSignatureModal.tsx` | Appearance options; signature_pad canvas |
| `signing/` | `SigningStep.tsx`, `signingSlice.ts` | Method picker; orchestrates prepare → (agent) → complete. Does NOT mint the download token — that moved to DownloadStep (Phase 2´) |
| `auth/` | `AuthModal.tsx`, `AccountWidget.tsx`, `authSlice.ts`, `useSupabaseSession.ts` | Login/register (email+password + Google OAuth via Supabase), header widget with credit balance |
| `download/` | `DownloadStep.tsx`, `SignedPdfPreview.tsx` | pdf.js canvas preview (always visible); download button calls `requestDownload` (401 → AuthModal, 402 → upsell modal). Token cached in sessionStorage — re-downloads are free |

## Accounts & Credits (Phase 2´ — milestone 1 implemented)

Full design in `docs/ACCOUNTS.md`. Implementation notes:

- Supabase client in `src/lib/supabase.ts` (env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; null-safe when unset). `useSupabaseSession()` (called in `App.tsx`) syncs the Supabase session → `GET /auth/me` → `auth` slice.
- Google OAuth does a full-page redirect — the signing flow survives it via `src/lib/flowPersistence.ts` (sessionStorage: step, upload info, placement, visualConfig). This also makes F5 survivable.
- Pending (payments milestone): `account/`/`billing/` module — package purchase (Stripe), business subscription management, custom stamp upload.

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

## Physical signing (Phase 1 — complete)

The physical flow is fully working end-to-end in `SigningStep.tsx` (cert picker modal, agent calls, complete sign). It is gated by `agentStatus === 'available'` — the button is disabled until the helper agent's `/health` responds.
