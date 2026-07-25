/**
 * Client-side mirror of the backend upload size policy
 * (backend/src/config/uploadPolicy.ts) so the UI can tell the user the credit
 * cost — or that a login is needed — *before* the upload starts, instead of
 * making them wait for a full upload only to be rejected.
 *
 * The backend remains the authority: these values only drive the pre-upload
 * prompt. Keep the VITE_* defaults in sync with the backend defaults.
 */

const MB = 1024 * 1024;

function envMb(raw: string | undefined, fallbackMb: number): number {
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * MB : fallbackMb * MB;
}

export const FREE_UPLOAD_BYTES = envMb(import.meta.env.VITE_FREE_UPLOAD_SIZE_MB, 5);
export const CREDIT_STEP_BYTES = envMb(import.meta.env.VITE_CREDIT_STEP_SIZE_MB, 5);
export const MAX_UPLOAD_BYTES = envMb(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB, 200);

/** Credits owed for a file of `bytes` — 0 up to and including the free tier. */
export function creditsForSize(bytes: number): number {
  if (bytes <= FREE_UPLOAD_BYTES) return 0;
  return Math.ceil((bytes - FREE_UPLOAD_BYTES) / CREDIT_STEP_BYTES);
}

/** "1,4 MB" / "820 KB" — for the size shown next to the chosen file. */
export function formatBytes(bytes: number, locale?: string): string {
  if (bytes < MB) {
    return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 0 })} KB`;
  }
  return `${(bytes / MB).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
