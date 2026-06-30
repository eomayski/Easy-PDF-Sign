import { Router } from 'express';
import { getJob, updateJob } from '../store/jobs';
import { issueDownloadToken } from '../services/ads/downloadToken';
import type { AdReward } from '../types';

const router = Router();

/**
 * POST /api/ads/confirm-view
 * Confirms that the user watched an ad and issues a one-time download token.
 *
 * For mock provider: auto-confirms without real verification.
 * For real providers: verify via server-to-server reward callback first.
 */
router.post('/confirm-view', async (req, res, next) => {
  try {
    const { jobId, reward }: { jobId: string; reward: AdReward } = req.body;

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.status !== 'signed') {
      res.status(400).json({ error: 'Job is not in signed state' });
      return;
    }

    if (reward.provider === 'mock') {
      // Phase 0: auto-confirm
      const downloadToken = issueDownloadToken(jobId);
      updateJob(jobId, { adViewed: true, downloadToken });
      res.json({ downloadToken });
      return;
    }

    // TODO Phase 2: real ad verification via AdVerifier
    res.status(501).json({ error: 'Real ad verification not yet implemented (Phase 2)' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ads/reward-callback
 * Server-to-server callback from the ad network (Phase 2+).
 */
router.post('/reward-callback', async (_req, res) => {
  // TODO Phase 2: implement GAM/Adsterra callback verification
  res.json({ ok: true });
});

export default router;
