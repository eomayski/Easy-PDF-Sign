import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  creditStepBytes,
  creditsForSize,
  freeUploadBytes,
  maxUploadBytes,
} from './uploadPolicy';

const MB = 1024 * 1024;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('policy defaults', () => {
  it('defaults to 5 MB free, 5 MB step, 200 MB hard cap', () => {
    expect(freeUploadBytes()).toBe(5 * MB);
    expect(creditStepBytes()).toBe(5 * MB);
    expect(maxUploadBytes()).toBe(200 * MB);
  });

  it('is configurable via env', () => {
    vi.stubEnv('FREE_UPLOAD_SIZE_MB', '10');
    vi.stubEnv('CREDIT_STEP_SIZE_MB', '2');
    vi.stubEnv('MAX_UPLOAD_SIZE_MB', '50');
    expect(freeUploadBytes()).toBe(10 * MB);
    expect(creditStepBytes()).toBe(2 * MB);
    expect(maxUploadBytes()).toBe(50 * MB);
  });

  it('falls back to the defaults for junk or non-positive values', () => {
    vi.stubEnv('FREE_UPLOAD_SIZE_MB', 'not-a-number');
    vi.stubEnv('CREDIT_STEP_SIZE_MB', '0');
    vi.stubEnv('MAX_UPLOAD_SIZE_MB', '-7');
    expect(freeUploadBytes()).toBe(5 * MB);
    expect(creditStepBytes()).toBe(5 * MB);
    expect(maxUploadBytes()).toBe(200 * MB);
  });
});

describe('creditsForSize — boundary values with the 5 MB / 5 MB defaults', () => {
  it('charges nothing up to and including exactly 5 MB', () => {
    expect(creditsForSize(0)).toBe(0);
    expect(creditsForSize(1)).toBe(0);
    expect(creditsForSize(5 * MB - 1)).toBe(0);
    expect(creditsForSize(5 * MB)).toBe(0);
  });

  it('charges 1 credit from 5 MB + 1 byte through exactly 10 MB', () => {
    expect(creditsForSize(5 * MB + 1)).toBe(1);
    expect(creditsForSize(6 * MB)).toBe(1);
    expect(creditsForSize(10 * MB - 1)).toBe(1);
    expect(creditsForSize(10 * MB)).toBe(1);
  });

  it('charges 2 credits from 10 MB + 1 byte', () => {
    expect(creditsForSize(10 * MB + 1)).toBe(2);
    expect(creditsForSize(15 * MB)).toBe(2);
  });

  it('charges per started step further up', () => {
    expect(creditsForSize(15 * MB + 1)).toBe(3);
    expect(creditsForSize(20 * MB)).toBe(3);
    expect(creditsForSize(23 * MB)).toBe(4);
  });

  it('follows the env-configured thresholds', () => {
    vi.stubEnv('FREE_UPLOAD_SIZE_MB', '1');
    vi.stubEnv('CREDIT_STEP_SIZE_MB', '10');
    expect(creditsForSize(1 * MB)).toBe(0);
    expect(creditsForSize(1 * MB + 1)).toBe(1);
    expect(creditsForSize(11 * MB)).toBe(1);
    expect(creditsForSize(11 * MB + 1)).toBe(2);
  });
});
