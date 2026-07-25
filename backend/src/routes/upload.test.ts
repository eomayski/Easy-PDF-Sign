import express from 'express';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { SignJWT } from 'jose';
import fs from 'fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prisma is mocked: these tests cover the route's policy/auth/refund wiring,
// not the SQL. The credit arithmetic itself is covered exhaustively at real MB
// boundaries in config/uploadPolicy.test.ts; here the thresholds are stubbed
// down to kilobytes so no multi-megabyte fixtures are needed.
const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    user: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
    creditTransaction: { create: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      creditTransaction: { create: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
    },
  };
});

vi.mock('../db/prisma', () => ({ prisma: prismaMock }));

import uploadRouter from './upload';

const USER_ID = 'user-uuid-1';
const EMAIL = 'test@example.com';
const KB = 1024;

const app = express();
app.use('/api/upload', uploadRouter);
// Same shape as the generic handler in index.ts
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  },
);

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  const token = await new SignJWT({ email: EMAIL })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  return `Bearer ${token}`;
}

/**
 * A valid PDF of exactly `sizeBytes` (>= ~600 B), padded with a trailing
 * comment. Exact sizes matter because the tests set the byte thresholds right
 * at the file size to check the boundary.
 */
async function makePdf(sizeBytes: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  const base = Buffer.from(await doc.save());
  const padding = sizeBytes - base.length;
  if (padding < 2) throw new Error(`makePdf: ${sizeBytes} is too small for a PDF`);
  return Buffer.concat([base, Buffer.from(`\n%${'A'.repeat(padding - 2)}`)]);
}

/**
 * Byte thresholds → the MB-denominated env vars the policy reads. Use
 * powers of two: bytes/MB*MB only round-trips exactly for those.
 */
function setPolicy(opts: { freeBytes?: number; stepBytes?: number; maxBytes?: number }) {
  const MB = 1024 * 1024;
  if (opts.freeBytes !== undefined) {
    vi.stubEnv('FREE_UPLOAD_SIZE_MB', String(opts.freeBytes / MB));
  }
  if (opts.stepBytes !== undefined) {
    vi.stubEnv('CREDIT_STEP_SIZE_MB', String(opts.stepBytes / MB));
  }
  if (opts.maxBytes !== undefined) {
    vi.stubEnv('MAX_UPLOAD_SIZE_MB', String(opts.maxBytes / MB));
  }
}

/** Mocks a user row and the successful-debit path. */
function mockUser(credits: number, accountType = 'free', subscriptionStatus: string | null = null) {
  const user = { id: USER_ID, email: EMAIL, credits, accountType, subscriptionStatus };
  prismaMock.user.findUnique.mockResolvedValue(user);
  txMock.user.updateMany.mockImplementation(async ({ where }: { where: { credits?: { gte: number } } }) => {
    const need = where.credits?.gte ?? 0;
    return { count: credits >= need ? 1 : 0 };
  });
  txMock.user.findUniqueOrThrow.mockImplementation(async () => ({ ...user, credits: 0 }));
  return user;
}

function ledgerRows() {
  return txMock.creditTransaction.create.mock.calls.map(
    (c) => (c[0] as { data: { reason: string; delta: number } }).data,
  );
}

/** 2 KB and 4 KB valid PDFs — exact sizes, so thresholds can sit on them. */
let pdf2k: Buffer;
let pdf4k: Buffer;

beforeEach(async () => {
  pdf2k = await makePdf(2 * KB);
  pdf4k = await makePdf(4 * KB);
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) =>
    cb(txMock),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  fs.rmSync('./.test-uploads', { recursive: true, force: true });
});

describe('POST /api/upload — free tier', () => {
  it('accepts an anonymous upload at exactly the free threshold, charging nothing', async () => {
    setPolicy({ freeBytes: 2 * KB, stepBytes: 2 * KB, maxBytes: 1024 * KB });

    const res = await request(app)
      .post('/api/upload')
      .attach('file', pdf2k, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.numPages).toBe(1);
    expect(res.body.creditsCharged).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an anonymous upload one byte over the free threshold', async () => {
    // Pins the inclusive-threshold boundary: multer's fileSize limit is
    // exclusive, so receiveSinglePdf() compensates with +1.
    setPolicy({ freeBytes: 2 * KB, stepBytes: 2 * KB, maxBytes: 1024 * KB });
    const oneOver = await makePdf(2 * KB + 1);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', oneOver, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('FILE_TOO_LARGE_LOGIN_REQUIRED');
  });

  it('charges exactly 1 credit for one byte over the free threshold when authenticated', async () => {
    setPolicy({ freeBytes: 2 * KB, stepBytes: 2 * KB, maxBytes: 1024 * KB });
    mockUser(5);
    txMock.user.findUniqueOrThrow.mockResolvedValue({ credits: 4 });
    const oneOver = await makePdf(2 * KB + 1);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', oneOver, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.creditsCharged).toBe(1);
    expect(ledgerRows()).toEqual([
      expect.objectContaining({ reason: 'upload_size_fee', delta: -1 }),
    ]);
  });
});

describe('POST /api/upload — anonymous over the free tier', () => {
  it('rejects with FILE_TOO_LARGE_LOGIN_REQUIRED (multer layer)', async () => {
    // Content-Length stays within the pre-flight allowance of the threshold,
    // so the rejection has to come from multer's fileSize limit.
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 1024 * KB });

    const res = await request(app)
      .post('/api/upload')
      .attach('file', pdf2k, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('FILE_TOO_LARGE_LOGIN_REQUIRED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects before buffering when Content-Length already exceeds the free tier', async () => {
    setPolicy({ freeBytes: 16 * KB, stepBytes: 4 * KB, maxBytes: 1024 * KB });

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(64 * KB, 1), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('FILE_TOO_LARGE_LOGIN_REQUIRED');
  });
});

describe('POST /api/upload — authenticated over the free tier', () => {
  it('succeeds, debits the right number of credits and writes an upload_size_fee row', async () => {
    // 4 KB file, 1 KB free, 1 KB step → ceil((4096-1024)/1024) = 3 credits
    const expected = 3;
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 1024 * KB });
    mockUser(10);
    txMock.user.findUniqueOrThrow.mockResolvedValue({ credits: 10 - expected });

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', pdf4k, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.creditsCharged).toBe(expected);
    expect(res.body.creditsRemaining).toBe(10 - expected);

    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, credits: { gte: expected } },
      data: { credits: { decrement: expected } },
    });
    expect(ledgerRows()).toEqual([
      expect.objectContaining({ reason: 'upload_size_fee', delta: -expected, userId: USER_ID }),
    ]);
  });

  it('rejects with INSUFFICIENT_CREDITS and debits nothing when the balance is too low', async () => {
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 1024 * KB });
    mockUser(0);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', pdf2k, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('INSUFFICIENT_CREDITS');
    expect(res.body.required).toBeGreaterThan(0);
    expect(res.body.available).toBe(0);
    expect(ledgerRows()).toEqual([]);
  });

  it('charges no size fee for an active business subscription', async () => {
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 1024 * KB });
    mockUser(0, 'business', 'active');

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', pdf2k, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.creditsCharged).toBe(0);
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
    expect(ledgerRows()).toEqual([]);
  });

  it('refunds the fee when the upload fails after the debit', async () => {
    const freeBytes = 1 * KB;
    const stepBytes = 1 * KB;
    const garbage = Buffer.alloc(4 * KB, 7); // passes the mimetype filter, not a PDF
    const expected = Math.ceil((garbage.length - freeBytes) / stepBytes);

    setPolicy({ freeBytes, stepBytes, maxBytes: 1024 * KB });
    mockUser(10);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', garbage, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(ledgerRows()).toEqual([
      expect.objectContaining({ reason: 'upload_size_fee', delta: -expected }),
      expect.objectContaining({ reason: 'upload_size_refund', delta: expected }),
    ]);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { credits: { increment: expected } },
    });
  });
});

describe('POST /api/upload — hard cap', () => {
  it('rejects an anonymous upload above the cap', async () => {
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 16 * KB });

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(64 * KB, 1), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_EXCEEDS_HARD_CAP');
  });

  it('rejects an authenticated upload above the cap even with plenty of credits', async () => {
    setPolicy({ freeBytes: 1 * KB, stepBytes: 1 * KB, maxBytes: 16 * KB });
    mockUser(9999);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', await bearer())
      .attach('file', Buffer.alloc(64 * KB, 1), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_EXCEEDS_HARD_CAP');
    expect(ledgerRows()).toEqual([]);
  });
});
