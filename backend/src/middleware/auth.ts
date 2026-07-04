import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string };
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// New Supabase projects sign JWTs with asymmetric keys (JWKS endpoint);
// SUPABASE_JWT_SECRET (HS256) is the legacy fallback for older projects.
const jwks = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  : null;
const hsKey = SUPABASE_JWT_SECRET ? new TextEncoder().encode(SUPABASE_JWT_SECRET) : null;

async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
  if (hsKey) {
    const { payload } = await jwtVerify(token, hsKey);
    return payload;
  }
  if (jwks) {
    const { payload } = await jwtVerify(token, jwks);
    return payload;
  }
  throw new Error('Auth is not configured: set SUPABASE_URL (or SUPABASE_JWT_SECRET) in .env');
}

/**
 * Verifies the Supabase-issued JWT from `Authorization: Bearer <token>` and
 * exposes `{ userId, email }` as `req.auth`. The user row in our DB is NOT
 * touched here — call `ensureUser()` (services/users.ts) where needed.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = await verifySupabaseJwt(header.slice('Bearer '.length));
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.auth = {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
    };
    next();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Auth is not configured')) {
      next(err);
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
