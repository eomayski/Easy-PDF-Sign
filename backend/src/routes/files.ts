import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getJob } from '../store/jobs';

const router = Router();

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
