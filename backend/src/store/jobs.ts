import fs from 'fs';
import type { SignJob } from '../types';

// In-memory store for Phase 0. Replace with Prisma in Phase 2+.
const jobs = new Map<string, SignJob>();

const TTL_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// GDPR data-retention: PDFs live at most TTL_MS after upload. Files are NOT
// deleted right after download — the download token stays reusable while the
// job lives, so a failed/interrupted download can be retried without a new
// credit debit. This sweeper is the single cleanup point.
setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.expiresAt.getTime() > now) continue;
    for (const p of [job.originalPath, job.signedPath, job.preparedPath]) {
      if (p) fs.unlink(p, () => {});
    }
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
    expiresAt: new Date(now.getTime() + TTL_MS),
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
  Object.assign(job, patch);
  return job;
}

export function deleteJob(id: string): void {
  jobs.delete(id);
}
