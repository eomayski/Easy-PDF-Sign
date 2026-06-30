import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import { uploadMiddleware } from '../middleware/upload';
import { createJob } from '../store/jobs';

const router = Router();

router.post('/', uploadMiddleware.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const pdfBytes = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const numPages = pdfDoc.getPageCount();

    const jobId = uuid();
    createJob(jobId, req.file.path, req.file.originalname);

    res.json({ jobId, numPages });
  } catch (err) {
    next(err);
  }
});

export default router;
