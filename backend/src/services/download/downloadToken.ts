import jwt from 'jsonwebtoken';

const SECRET = process.env.DOWNLOAD_TOKEN_SECRET ?? 'dev-secret-change-me';
const TTL = parseInt(process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? '3600', 10);

/** Token lifetime in ms — the job must not be swept before the token expires. */
export const downloadTokenTtlMs = TTL * 1000;

export function issueDownloadToken(jobId: string): string {
  return jwt.sign({ jobId, single_use: true }, SECRET, { expiresIn: TTL });
}

export function verifyDownloadToken(token: string): { jobId: string } {
  const payload = jwt.verify(token, SECRET) as { jobId: string };
  return { jobId: payload.jobId };
}
