import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import { MulterError } from 'multer';
import fs from 'fs';
import { receiveSinglePdf } from '../middleware/upload';
import { optionalAuth } from '../middleware/auth';
import { createJob } from '../store/jobs';
import {
  MULTIPART_OVERHEAD_ALLOWANCE,
  UPLOAD_ERROR,
  creditsForSize,
  freeUploadBytes,
  maxUploadBytes,
} from '../config/uploadPolicy';
import {
  debitCreditsForUploadSize,
  ensureUser,
  hasActiveBusinessSubscription,
  refundUploadSizeFee,
} from '../services/users';

const router = Router();

function discard(filePath: string | undefined) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {
    // Already gone, or never written — the TTL sweeper is the backstop.
  });
}

/**
 * POST /api/upload
 *
 * Tiered size policy (docs/ACCOUNTS.md → "Upload size fees"):
 *   - up to FREE_UPLOAD_SIZE_MB: free, no account needed (unchanged behaviour)
 *   - above it: requires auth and costs 1 credit per started CREDIT_STEP_SIZE_MB,
 *     debited here at upload time
 *   - above MAX_UPLOAD_SIZE_MB: rejected for everyone
 *
 * Enforced in two layers: a Content-Length pre-flight that rejects before the
 * body is buffered, then multer's fileSize limit as the authoritative check.
 */
router.post('/', optionalAuth, async (req, res, next) => {
  const hardCap = maxUploadBytes();
  const freeCap = freeUploadBytes();
  const isAuthenticated = req.auth !== undefined;

  // --- Layer 1: pre-flight on the declared length, before buffering anything.
  // The allowance absorbs multipart framing so a file at exactly the free
  // threshold is never rejected here (multer sees the exact file size).
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared)) {
    const declaredFileBytes = declared - MULTIPART_OVERHEAD_ALLOWANCE;
    if (declaredFileBytes > hardCap) {
      res.status(413).json({
        error: 'File exceeds the maximum allowed size',
        code: UPLOAD_ERROR.hardCap,
        maxBytes: hardCap,
      });
      return;
    }
    if (!isAuthenticated && declaredFileBytes > freeCap) {
      res.status(401).json({
        error: 'Files above the free size limit require an account',
        code: UPLOAD_ERROR.loginRequired,
        freeBytes: freeCap,
      });
      return;
    }
  }

  // --- Layer 2: multer, with the limit the caller is actually entitled to.
  try {
    await receiveSinglePdf(req, res, isAuthenticated ? hardCap : freeCap);
  } catch (err) {
    discard(req.file?.path);
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      if (!isAuthenticated) {
        res.status(401).json({
          error: 'Files above the free size limit require an account',
          code: UPLOAD_ERROR.loginRequired,
          freeBytes: freeCap,
        });
      } else {
        res.status(413).json({
          error: 'File exceeds the maximum allowed size',
          code: UPLOAD_ERROR.hardCap,
          maxBytes: hardCap,
        });
      }
      return;
    }
    next(err);
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // The jobId is minted up front so the ledger row can reference it — the
  // debit has to happen before the job exists.
  const jobId = uuid();
  const required = creditsForSize(file.size);
  let creditsCharged = 0;
  let creditsRemaining: number | null = null;

  try {
    if (required > 0) {
      if (!req.auth) {
        // Unreachable via multer's limit, kept as an explicit guard.
        discard(file.path);
        res.status(401).json({
          error: 'Files above the free size limit require an account',
          code: UPLOAD_ERROR.loginRequired,
          freeBytes: freeCap,
        });
        return;
      }

      const { userId, email } = req.auth;
      const user = await ensureUser(userId, email);

      if (hasActiveBusinessSubscription(user)) {
        // Business subscriptions are unlimited — no size fee, same rule as the
        // download debit. The hard cap above still applies.
        creditsRemaining = user.credits;
      } else {
        const remaining = await debitCreditsForUploadSize(userId, required, jobId);
        if (remaining === null) {
          discard(file.path);
          res.status(402).json({
            error: 'Not enough credits for a file of this size',
            code: UPLOAD_ERROR.insufficientCredits,
            required,
            available: user.credits,
          });
          return;
        }
        creditsCharged = required;
        creditsRemaining = remaining;
      }
    }

    const pdfBytes = await fs.promises.readFile(file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const numPages = pdfDoc.getPageCount();

    createJob(jobId, file.path, file.originalname);

    res.json({ jobId, numPages, creditsCharged, creditsRemaining });
  } catch (err) {
    // Anything after a successful debit must give the credits back — the
    // upload the user paid for did not happen.
    if (creditsCharged > 0 && req.auth) {
      try {
        const restored = await refundUploadSizeFee(req.auth.userId, creditsCharged, jobId);
        console.warn(
          `Refunded ${creditsCharged} upload-size credit(s) to ${req.auth.userId} ` +
            `for failed job ${jobId}; balance is now ${restored}`,
        );
      } catch (refundErr) {
        console.error(
          `FAILED to refund ${creditsCharged} upload-size credit(s) to ` +
            `${req.auth.userId} for job ${jobId}:`,
          refundErr,
        );
      }
    }
    discard(file.path);
    next(err);
  }
});

export default router;
