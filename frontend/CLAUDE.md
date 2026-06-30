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

## Feature modules (`src/features/`)

| Directory | Key files | Responsibility |
|-----------|-----------|----------------|
| `upload/` | `UploadStep.tsx`, `uploadSlice.ts` | Drag-drop or browse; POST to /api/upload |
| `viewer/` | `PdfViewer.tsx`, `ViewerStep.tsx` | pdf.js rendering; page navigation |
| `signature-box/` | `SignatureBox.tsx` | Konva canvas overlay; draw + resize + drag rectangle |
| `sign-config/` | `SignConfigStep.tsx`, `HandwrittenSignatureModal.tsx` | Appearance options; signature_pad canvas |
| `signing/` | `SigningStep.tsx`, `signingSlice.ts` | Method picker; orchestrates prepare → (agent) → complete |
| `download/` | `DownloadStep.tsx` | Download link + "sign new" reset |

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

## Adding a new signing method (Phase 1 physical)

1. In `SigningStep.tsx`, enable the `physical` method card (remove `disabled` prop).
2. After `prepareSign` returns `byteRangeHash`, call the helper agent:
   ```
   GET  http://127.0.0.1:17357/certificates  → pick certId
   POST http://127.0.0.1:17357/sign          → { hash, certId } → { cms }
   ```
3. Send CMS to `POST /api/sign/complete`.
4. Then call `confirmAdView` → get `downloadToken`.
