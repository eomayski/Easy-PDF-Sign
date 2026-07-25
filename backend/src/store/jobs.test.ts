import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJob,
  deleteJob,
  extendJob,
  getJob,
  signedJobTtlMs,
  unsignedJobTtlMs,
  updateJob,
} from './jobs';

const MIN = 60 * 1000;
let counter = 0;

/** Реален файл на диска, за да се провери че изтриването го маха. */
function tempFile(): string {
  const p = path.join(os.tmpdir(), `eps-jobs-test-${process.pid}-${counter++}.pdf`);
  fs.writeFileSync(p, 'x');
  return p;
}

function newJob() {
  const original = tempFile();
  const job = createJob(`job-${counter}`, original, 'doc.pdf');
  return { job, original };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('retention windows', () => {
  it('defaults to 60 min unsigned and 15 min signed', () => {
    expect(unsignedJobTtlMs()).toBe(60 * MIN);
    expect(signedJobTtlMs()).toBe(15 * MIN);
  });

  it('is configurable via env', () => {
    vi.stubEnv('JOB_TTL_MINUTES', '30');
    vi.stubEnv('SIGNED_JOB_TTL_MINUTES', '5');
    expect(unsignedJobTtlMs()).toBe(30 * MIN);
    expect(signedJobTtlMs()).toBe(5 * MIN);
  });

  it('falls back to the defaults for junk values', () => {
    vi.stubEnv('JOB_TTL_MINUTES', 'abc');
    vi.stubEnv('SIGNED_JOB_TTL_MINUTES', '0');
    expect(unsignedJobTtlMs()).toBe(60 * MIN);
    expect(signedJobTtlMs()).toBe(15 * MIN);
  });

  it('gives a fresh upload the unsigned window', () => {
    const { job } = newJob();
    const expected = Date.now() + unsignedJobTtlMs();
    expect(job.expiresAt.getTime()).toBeGreaterThan(expected - 5000);
    expect(job.expiresAt.getTime()).toBeLessThanOrEqual(expected + 5000);
    deleteJob(job.id);
  });

  it('shortens the window to the signed one when the job is signed', () => {
    const { job } = newJob();
    const beforeSigning = job.expiresAt.getTime();

    updateJob(job.id, { status: 'signed', signedPath: tempFile() });

    const after = getJob(job.id)!.expiresAt.getTime();
    expect(after).toBeLessThan(beforeSigning);
    const expected = Date.now() + signedJobTtlMs();
    expect(after).toBeGreaterThan(expected - 5000);
    expect(after).toBeLessThanOrEqual(expected + 5000);
    deleteJob(job.id);
  });

  it('does not re-shorten on later updates of an already signed job', () => {
    const { job } = newJob();
    updateJob(job.id, { status: 'signed', signedPath: tempFile() });
    const afterSigning = getJob(job.id)!.expiresAt.getTime();

    extendJob(job.id, 60 * MIN); // as the download-token issuance does
    updateJob(job.id, { status: 'downloaded' });

    // Still the extended expiry — a paid download must not be cut back.
    expect(getJob(job.id)!.expiresAt.getTime()).toBeGreaterThan(afterSigning);
    deleteJob(job.id);
  });
});

describe('extendJob', () => {
  it('extends a signed job so a paid token cannot outlive its file', () => {
    const { job } = newJob();
    updateJob(job.id, { status: 'signed', signedPath: tempFile() });
    const signedExpiry = getJob(job.id)!.expiresAt.getTime();

    extendJob(job.id, 60 * MIN);

    expect(getJob(job.id)!.expiresAt.getTime()).toBeGreaterThan(signedExpiry);
    deleteJob(job.id);
  });

  it('never shortens an existing window', () => {
    const { job } = newJob();
    const original = getJob(job.id)!.expiresAt.getTime();

    extendJob(job.id, 1 * MIN);

    expect(getJob(job.id)!.expiresAt.getTime()).toBe(original);
    deleteJob(job.id);
  });

  it('ignores an unknown job', () => {
    expect(() => extendJob('nope', 1000)).not.toThrow();
  });
});

describe('deleteJob', () => {
  it('removes the job and unlinks every file it owns', () => {
    const { job, original } = newJob();
    const prepared = tempFile();
    const signed = tempFile();
    updateJob(job.id, { status: 'signed', preparedPath: prepared, signedPath: signed });

    expect(deleteJob(job.id)).toBe(true);

    expect(getJob(job.id)).toBeUndefined();
    // fs.unlink is async inside the store — give it a tick.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fs.existsSync(original)).toBe(false);
        expect(fs.existsSync(prepared)).toBe(false);
        expect(fs.existsSync(signed)).toBe(false);
        resolve();
      }, 50);
    });
  });

  it('is idempotent for an unknown job', () => {
    expect(deleteJob('never-existed')).toBe(false);
  });
});
