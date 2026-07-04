import { Router } from 'express';
import fs from 'fs';
import { issueDownloadToken, verifyDownloadToken } from '../services/download/downloadToken';
import { getJob, updateJob } from '../store/jobs';
import { requireAuth } from '../middleware/auth';
import {
  debitCreditForDownload,
  ensureUser,
  hasActiveBusinessSubscription,
} from '../services/users';

const router = Router();

/**
 * POST /api/download/request
 * The Phase 2´ gate (replaces the Phase 0 /ads/confirm-view): requires an
 * authenticated user and atomically debits 1 signature credit (skipped for
 * business accounts with an active subscription) before issuing the token.
 */
router.post('/request', requireAuth, async (req, res, next) => {
  try {
    const { jobId }: { jobId?: string } = req.body;
    const job = jobId ? getJob(jobId) : undefined;
    if (!jobId || !job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.status !== 'signed') {
      res.status(400).json({ error: 'Job is not in signed state' });
      return;
    }

    const { userId, email } = req.auth!;
    const user = await ensureUser(userId, email);

    let creditsRemaining: number;
    if (hasActiveBusinessSubscription(user)) {
      creditsRemaining = user.credits; // no debit for business subscriptions
    } else {
      const remaining = await debitCreditForDownload(userId, jobId);
      if (remaining === null) {
        res.status(402).json({ error: 'No signature credits remaining', credits: 0 });
        return;
      }
      creditsRemaining = remaining;
    }

    const downloadToken = issueDownloadToken(jobId);
    updateJob(jobId, { downloadToken });
    res.json({ downloadToken, creditsRemaining });
  } catch (err) {
    next(err);
  }
});

router.get('/:token', (req, res) => {
  try {
    const { jobId } = verifyDownloadToken(req.params.token);
    const job = getJob(jobId);

    if (!job || !job.signedPath || !fs.existsSync(job.signedPath)) {
      res.status(404).json({ error: 'File not found or token expired' });
      return;
    }

    const fileName = job.fileName.replace(/\.pdf$/i, '_signed.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = fs.createReadStream(job.signedPath);
    stream.pipe(res);

    // Files are NOT deleted here — the token stays reusable (free re-download
    // after an interrupted stream) until the job-TTL sweeper in store/jobs.ts
    // removes everything (GDPR retention bound: 1 h after upload).
    stream.on('close', () => {
      updateJob(jobId, { status: 'downloaded' });
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired download token' });
  }
});

export default router;
