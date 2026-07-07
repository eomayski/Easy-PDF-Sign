import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../services/users';

const router = Router();

router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const { userId, email } = req.auth!;
    const user = await ensureUser(userId, email);
    res.json({ credits: user.credits, accountType: user.accountType });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/credits/purchase
 * Package purchase (50 credits / €2.99) — arrives with the PaymentProvider
 * (Stripe) integration in the next milestone. See services/billing/.
 */
router.post('/purchase', requireAuth, (_req, res) => {
  res.status(501).json({
    error: 'Купуването на кредити все още не е налично — очаквайте скоро.',
  });
});

export default router;
