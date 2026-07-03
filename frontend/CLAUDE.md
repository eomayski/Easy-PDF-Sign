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
  api          RTK Query endpoints (uploadPdf, prepareSign, completeSign, confirmAdView)
  upload       { jobId, numPages, fileName }
  signing      { method, status, byteRangeHash, downloadToken, errorMessage }
```

`confirmAdView` is being replaced by a `requestDownload` endpoint (Phase 2´ — see below) that
requires auth and debits a signature credit instead of verifying an ad view.

## Feature modules (`src/features/`)

| Directory | Key files | Responsibility |
|-----------|-----------|----------------|
| `upload/` | `UploadStep.tsx`, `uploadSlice.ts` | Drag-drop or browse; POST to /api/upload |
| `viewer/` | `PdfViewer.tsx`, `ViewerStep.tsx` | pdf.js rendering; page navigation |
| `signature-box/` | `SignatureBox.tsx` | Konva canvas overlay; draw + resize + drag rectangle |
| `sign-config/` | `SignConfigStep.tsx`, `HandwrittenSignatureModal.tsx` | Appearance options; signature_pad canvas |
| `signing/` | `SigningStep.tsx`, `signingSlice.ts` | Method picker; orchestrates prepare → (agent) → complete |
| `download/` | `DownloadStep.tsx` | Renders a preview of the signed PDF (always visible); download button requires login + available credits — see "Accounts & Credits" below |

## Accounts & Credits (Phase 2´ — planned)

Full design in `docs/ACCOUNTS.md`. Frontend implications once built:

- New `auth/` feature module: login/register forms, session state (RTK Query `authApi` + an `auth` slice: `{ userId, email, accountType, credits }`).
- `DownloadStep.tsx` changes: the signed PDF preview renders unconditionally after signing; the actual download action calls `requestDownload` (replacing `confirmAdView`) which requires the user to be logged in and to have ≥1 credit (or a `business` account). On `401`/`402` responses, show a login prompt or an upsell (buy 50 credits for €2.90 / upgrade to business) instead of the download.
- New `account/` (or `billing/`) feature module: credit balance display, package purchase, business subscription management, and (business only) custom stamp image upload — reusing the existing `imageDataUrl` concept already in `SignConfigStep.tsx`'s `visualConfig`.

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
