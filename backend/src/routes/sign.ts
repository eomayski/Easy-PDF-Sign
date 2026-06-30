import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getJob, updateJob } from '../store/jobs';
import { mockSign } from '../services/signing/mockSigner';
import type { PdfRect, VisualSignatureConfig, SigningMethod } from '../types';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

/**
 * POST /api/sign/prepare
 * Applies the visual appearance to the PDF.
 * For mock method: also "signs" it (no crypto) and saves the result.
 * For physical method (Phase 1): returns byteRangeHash for the helper-agent.
 */
router.post('/prepare', async (req, res, next) => {
  try {
    const {
      jobId,
      page,
      pdfRect,
      visualConfig,
      method,
    }: {
      jobId: string;
      page: number;
      pdfRect: PdfRect;
      visualConfig: VisualSignatureConfig;
      method: SigningMethod;
    } = req.body;

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const pdfBytes = fs.readFileSync(job.originalPath);

    if (method === 'mock') {
      // Phase 0: apply visual layer and treat as "signed"
      const signedBytes = await mockSign(pdfBytes, page - 1, pdfRect, visualConfig);
      const signedFileName = `${jobId}_signed.pdf`;
      const signedPath = path.join(UPLOAD_DIR, signedFileName);
      fs.writeFileSync(signedPath, signedBytes);

      updateJob(jobId, { status: 'signed', method: 'mock', signedPath });
      res.json({ jobId, status: 'signed' });
      return;
    }

    if (method === 'physical') {
      // Phase 1: apply visual layer + add PAdES placeholder, return hash
      // TODO Phase 1: implement @signpdf placeholder + hash computation
      res.status(501).json({ error: 'Physical signing not yet implemented (Phase 1)' });
      return;
    }

    if (method === 'cloud') {
      // Phase 3: remote signing via Evrotrust/B-Trust
      // TODO Phase 3: implement CloudSignerProvider
      res.status(501).json({ error: 'Cloud signing not yet implemented (Phase 3)' });
      return;
    }

    res.status(400).json({ error: 'Unknown signing method' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sign/complete
 * Receives a CMS signature from the browser (physical flow) and embeds it.
 * Phase 1 only.
 */
router.post('/complete', async (req, res, next) => {
  try {
    const { jobId }: { jobId: string; cms: string } = req.body;
    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // TODO Phase 1: embed CMS into PAdES placeholder
    res.status(501).json({ error: 'Physical signing completion not yet implemented (Phase 1)' });
  } catch (err) {
    next(err);
  }
});

export default router;
