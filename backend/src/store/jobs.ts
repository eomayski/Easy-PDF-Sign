import fs from 'fs';
import type { SignJob } from '../types';

// In-memory store for Phase 0. Replace with Prisma in Phase 2+.
const jobs = new Map<string, SignJob>();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function envMinutes(name: string, fallbackMinutes: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMinutes;
  return minutes * 60 * 1000;
}

/**
 * Retention for a job that has NOT been signed yet — an abandoned upload. The
 * primary cleanup for these is the explicit `DELETE /api/jobs/:id` the frontend
 * fires when the user leaves the flow; this TTL only catches sessions that
 * never said goodbye (crash, closed tab, lost connection).
 */
export function unsignedJobTtlMs(): number {
  return envMinutes('JOB_TTL_MINUTES', 60);
}

/**
 * Retention once the document is signed. Much shorter: the user is on the
 * download page and acts within minutes. Measured from the moment of signing.
 */
export function signedJobTtlMs(): number {
  return envMinutes('SIGNED_JOB_TTL_MINUTES', 15);
}

function removeJobFiles(job: SignJob): void {
  for (const p of [job.originalPath, job.signedPath, job.preparedPath]) {
    if (p) fs.unlink(p, () => {});
  }
}

// GDPR data-retention backstop. Files are NOT deleted right after download —
// the download token stays reusable while the job lives, so an interrupted
// download can be retried without a second credit debit.
setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.expiresAt.getTime() > now) continue;
    removeJobFiles(job);
    jobs.delete(job.id);
  }
}, SWEEP_INTERVAL_MS).unref();

export function createJob(id: string, originalPath: string, fileName: string): SignJob {
  const now = new Date();
  const job: SignJob = {
    id,
    status: 'uploaded',
    originalPath,
    signedPath: null,
    preparedPath: null,
    preparedByteRange: null,
    fileName,
    method: null,
    byteRangeHash: null,
    downloadToken: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + unsignedJobTtlMs()),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): SignJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<SignJob>): SignJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  // Signing switches the job to the short retention window, counted from now —
  // done here rather than at the (three) call sites in routes/sign.ts.
  const justSigned = patch.status === 'signed' && job.status !== 'signed';
  Object.assign(job, patch);
  if (justSigned) {
    job.expiresAt = new Date(Date.now() + signedJobTtlMs());
  }
  return job;
}

/**
 * Keeps the job alive for at least `ms` from now — never shortens it.
 *
 * Called when a download token is issued, i.e. right after a credit was
 * debited: the file has been paid for and must outlive the token, otherwise a
 * retried download would 404 on a file the user was charged for.
 */
export function extendJob(id: string, ms: number): void {
  const job = jobs.get(id);
  if (!job) return;
  const until = Date.now() + ms;
  if (until > job.expiresAt.getTime()) {
    job.expiresAt = new Date(until);
  }
}

/** Deletes the job **and its files**. Returns false if there was no such job. */
export function deleteJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  removeJobFiles(job);
  jobs.delete(id);
  return true;
}
