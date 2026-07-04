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
