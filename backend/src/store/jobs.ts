import type { SignJob } from '../types';

// In-memory store for Phase 0. Replace with Prisma in Phase 2+.
const jobs = new Map<string, SignJob>();

const TTL_MS = 60 * 60 * 1000; // 1 hour

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
    adViewed: false,
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
