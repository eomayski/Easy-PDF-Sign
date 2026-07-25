/**
 * Tiered upload size policy (see docs/ACCOUNTS.md → "Upload size fees").
 *
 * Files up to the free threshold cost nothing and need no account. Above it,
 * the upload costs 1 credit per started step, must be authenticated, and is
 * charged at upload time (the disk/processing cost is incurred there, unlike
 * the download debit which is charged at token issuance).
 *
 * Env is read lazily on every call — the values are only consulted per request,
 * and tests override them with vi.stubEnv().
 */

const MB = 1024 * 1024;

function envMb(name: string, fallbackMb: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * MB : fallbackMb * MB;
}

/** Largest file that is free for everyone, including anonymous users. */
export function freeUploadBytes(): number {
  return envMb('FREE_UPLOAD_SIZE_MB', 5);
}

/** Each started step above the free threshold costs 1 credit. */
export function creditStepBytes(): number {
  return envMb('CREDIT_STEP_SIZE_MB', 5);
}

/** Absolute cap — rejected for everyone, regardless of auth or credits. */
export function maxUploadBytes(): number {
  return envMb('MAX_UPLOAD_SIZE_MB', 200);
}

/**
 * Credits owed for a file of `bytes`. 0 up to and including the free
 * threshold; above it, ceil() of the excess over the step size.
 *
 * With the 5 MB / 5 MB defaults: 5 MB → 0, 5 MB+1 B → 1, 10 MB → 1,
 * 10 MB+1 B → 2, 23 MB → 4.
 */
export function creditsForSize(bytes: number): number {
  const free = freeUploadBytes();
  if (bytes <= free) return 0;
  return Math.ceil((bytes - free) / creditStepBytes());
}

/**
 * Multipart framing (boundaries, Content-Disposition header, filename) makes
 * Content-Length a few hundred bytes larger than the file itself. The
 * pre-flight guard subtracts this allowance so a file of exactly the free
 * threshold is never rejected before it is even read; multer's fileSize limit
 * is the authoritative check and sees the file bytes only.
 */
export const MULTIPART_OVERHEAD_ALLOWANCE = 8 * 1024;

/** Structured error codes the frontend switches on. */
export const UPLOAD_ERROR = {
  loginRequired: 'FILE_TOO_LARGE_LOGIN_REQUIRED',
  insufficientCredits: 'INSUFFICIENT_CREDITS',
  hardCap: 'FILE_EXCEEDS_HARD_CAP',
} as const;
