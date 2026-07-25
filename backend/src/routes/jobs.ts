import { Router } from 'express';
import { deleteJob } from '../store/jobs';

const router = Router();

/**
 * DELETE /api/jobs/:jobId
 *
 * Drops a job and its PDFs immediately, instead of waiting for the retention
 * sweeper. The frontend calls this when the user leaves the signing flow, so an
 * abandoned or finished document does not sit on disk for the full TTL.
 *
 * No auth: the jobId is the capability, exactly as for `GET /files/:jobId`.
 * Anyone holding it can already read the document, so being able to delete it
 * grants nothing new — and the only thing at risk is the holder's own file.
 *
 * Idempotent: deleting an unknown or already-swept job is a success.
 */
router.delete('/:jobId', (req, res) => {
  deleteJob(req.params.jobId);
  res.status(204).end();
});

export default router;
