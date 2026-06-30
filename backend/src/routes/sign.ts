import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getJob, updateJob } from '../store/jobs';
import { mockSign } from '../services/signing/mockSigner';
import { preparePAdES, completePAdES } from '../services/signing/physicalSigner';
import type { PdfRect, VisualSignatureConfig, SigningMethod } from '../types';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

/**
 * POST /api/sign/prepare
 *
 * mock:     Applies visual layer, treats as "signed", returns { jobId, status }.
 * physical: Applies visual layer + PAdES placeholder, returns { jobId, byteRangeHash }.
 */
router.post('/prepare', async (req, res, next) => {
  try {
    const {
      jobId,
      page,
      pdfRect,
      visualConfig,
      method,
      signerName,
    }: {
      jobId: string;
      page: number;
      pdfRect: PdfRect;
      visualConfig: VisualSignatureConfig;
      method: SigningMethod;
      signerName?: string;
    } = req.body;

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const pdfBytes = fs.readFileSync(job.originalPath);

    if (method === 'mock') {
      const signedBytes = await mockSign(pdfBytes, page - 1, pdfRect, visualConfig);
      const signedPath = path.join(UPLOAD_DIR, `${jobId}_signed.pdf`);
      fs.writeFileSync(signedPath, signedBytes);
      updateJob(jobId, { status: 'signed', method: 'mock', signedPath });
      res.json({ jobId, status: 'signed' });
      return;
    }

    if (method === 'physical') {
      const { pdfWithPlaceholder, byteRangeHash, byteRange } = await preparePAdES(
        pdfBytes,
        page - 1,
        pdfRect,
        visualConfig,
        signerName,
      );
      const preparedPath = path.join(UPLOAD_DIR, `${jobId}_prepared.pdf`);
      fs.writeFileSync(preparedPath, pdfWithPlaceholder);
      updateJob(jobId, {
        status: 'prepared',
        method: 'physical',
        preparedPath,
        preparedByteRange: byteRange,
        byteRangeHash,
      });
      res.json({ jobId, byteRangeHash });
      return;
    }

    if (method === 'cloud') {
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
 *
 * Receives the hex-encoded CMS from the browser (produced by the helper agent)
 * and embeds it into the PAdES placeholder to produce the final signed PDF.
 */
router.post('/complete', async (req, res, next) => {
  try {
    const { jobId, cms }: { jobId: string; cms: string } = req.body;

    if (!jobId || !cms) {
      res.status(400).json({ error: 'jobId and cms are required' });
      return;
    }

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.status !== 'prepared' || !job.preparedPath || !job.preparedByteRange) {
      res.status(409).json({ error: 'Job is not in prepared state' });
      return;
    }

    const preparedBytes = fs.readFileSync(job.preparedPath);
    const signedBytes = completePAdES(preparedBytes, job.preparedByteRange, cms);

    const signedPath = path.join(UPLOAD_DIR, `${jobId}_signed.pdf`);
    fs.writeFileSync(signedPath, signedBytes);

    // Remove the temporary prepared file
    fs.unlinkSync(job.preparedPath);

    updateJob(jobId, { status: 'signed', signedPath, preparedPath: null });
    res.json({ jobId, status: 'signed' });
  } catch (err) {
    next(err);
  }
});

export default router;
