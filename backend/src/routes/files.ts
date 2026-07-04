import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getJob } from '../store/jobs';

const router = Router();

// Serve the signed PDF inline for the download-page preview.
// Deliberately unauthenticated (the preview is always visible — see
// docs/ACCOUNTS.md "Core rule"); the jobId is an unguessable UUID.
router.get('/:jobId/signed', (req, res) => {
  const job = getJob(req.params.jobId);
  const signedStates = ['signed', 'downloaded'];
  if (!job || !signedStates.includes(job.status) || !job.signedPath) {
    res.status(404).json({ error: 'Signed document not found' });
    return;
  }
  if (!fs.existsSync(job.signedPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${path.basename(job.signedPath)}"`,
  );
  fs.createReadStream(job.signedPath).pipe(res);
});

// Serve the original PDF for the viewer
router.get('/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (!fs.existsSync(job.originalPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${path.basename(job.originalPath)}"`,
  );
  fs.createReadStream(job.originalPath).pipe(res);
});

export default router;
