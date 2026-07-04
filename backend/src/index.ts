import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import uploadRouter from './routes/upload';
import filesRouter from './routes/files';
import signRouter from './routes/sign';
import authRouter from './routes/auth';
import creditsRouter from './routes/credits';
import downloadRouter from './routes/download';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/upload', uploadRouter);
app.use('/api/files', filesRouter);
app.use('/api/sign', signRouter);
app.use('/api/auth', authRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/download', downloadRouter);

// Installer downloads (populated by CI — see helper-agent/installer/)
app.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Generic error handler
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  },
);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
