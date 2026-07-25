import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

/**
 * Runs multer for a single `file` field with a **per-request** size limit —
 * the cap depends on whether the caller is authenticated, which multer cannot
 * express in a single shared instance (limits are fixed at construction).
 *
 * `maxInclusiveBytes` is the largest size that must still be **accepted**.
 * Note multer/busboy treats `limits.fileSize` as exclusive — a file of exactly
 * `fileSize` bytes is rejected — so it gets +1 here. Without that, a file of
 * exactly the free threshold would be refused, breaking the "up to 5 MB is
 * free" rule.
 *
 * Resolves once the file is on disk; rejects with the multer error (notably
 * `MulterError` with code `LIMIT_FILE_SIZE`) so the route can map it to a
 * structured error code. On a size abort multer has already written a partial
 * file — the caller is responsible for unlinking `req.file?.path`.
 */
export function receiveSinglePdf(
  req: Request,
  res: Response,
  maxInclusiveBytes: number,
): Promise<void> {
  const handler = multer({
    storage,
    limits: { fileSize: maxInclusiveBytes + 1 },
    fileFilter,
  }).single('file');

  return new Promise((resolve, reject) => {
    handler(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
