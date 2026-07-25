import type { SignaturePlacement, VisualSignatureConfig } from '../types';

/**
 * Persists the signing-flow state across full page reloads — needed because
 * the Google OAuth login redirects away and back, which would otherwise drop
 * the user to step 0 and lose the signed document. (Also makes F5 survivable;
 * the backend keeps the job for 1 hour.) sessionStorage: per-tab, cleared on
 * tab close.
 */

const KEY = 'easy-pdf-sign-flow';

export interface PersistedFlow {
  step: number;
  upload: { jobId: string; numPages: number; fileName: string };
  placement: SignaturePlacement | null;
  visualConfig: VisualSignatureConfig | null;
}

export function saveFlow(flow: PersistedFlow): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flow));
  } catch {
    // quota exceeded (huge signature image) — worst case the flow resets on reload
  }
}

export function loadFlow(): PersistedFlow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const flow = JSON.parse(raw) as PersistedFlow;
    if (!flow.upload?.jobId || typeof flow.step !== 'number') return null;
    return flow;
  } catch {
    return null;
  }
}

export function clearFlow(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------- *
 * Pending oversized upload (step 0, before a job exists)
 * ------------------------------------------------------------------------- */

const PENDING_KEY = 'easy-pdf-sign-pending-upload';
const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * What the user had chosen when an oversized file sent them to the login
 * screen. Only metadata: a `File` cannot survive a page reload, so after the
 * Google OAuth round-trip we can restore the *intent* (and quote the price
 * again) but the user has to re-pick the file itself.
 */
export interface PendingUpload {
  fileName: string;
  fileSize: number;
  savedAt: number;
}

export function savePendingUpload(fileName: string, fileSize: number): void {
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ fileName, fileSize, savedAt: Date.now() } satisfies PendingUpload),
    );
  } catch {
    // ignore — the user just re-picks the file with no prompt
  }
}

export function loadPendingUpload(): PendingUpload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingUpload;
    if (!pending.fileName || typeof pending.fileSize !== 'number') return null;
    if (Date.now() - pending.savedAt > PENDING_TTL_MS) return null;
    return pending;
  } catch {
    return null;
  }
}

export function clearPendingUpload(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}
