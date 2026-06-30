import { Router } from 'express';
import fs from 'fs';
import { verifyDownloadToken } from '../services/ads/downloadToken';
import { getJob, updateJob } from '../store/jobs';

const router = Router();

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

    stream.on('close', () => {
      // Delete files after download to minimise data retention (GDPR)
      if (job.signedPath) {
        fs.unlink(job.signedPath, () => {});
      }
      fs.unlink(job.originalPath, () => {});
      updateJob(jobId, { status: 'downloaded' });
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired download token' });
  }
});

export default router;
