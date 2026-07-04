import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../services/users';

const router = Router();

/**
 * GET /api/auth/me
 * Register/login/logout/password-reset are handled client-side by the
 * Supabase SDK — this is the only auth route the backend owns. It also
 * provisions the local User row (with the signup bonus) on first call.
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId, email } = req.auth!;
    const user = await ensureUser(userId, email);
    res.json({
      userId: user.id,
      email: user.email,
      accountType: user.accountType,
      credits: user.credits,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
