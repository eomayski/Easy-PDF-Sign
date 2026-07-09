import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../services/users';
import { paymentProvider } from '../services/billing/StripePaymentProvider';
import { BillingNotConfiguredError } from '../services/billing/PaymentProvider';

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
 * Package purchase (50 credits / €2.99): returns a Stripe Checkout URL.
 * Credits are granted by the webhook (routes/billing.ts) after payment.
 */
router.post('/purchase', requireAuth, async (req, res, next) => {
  try {
    const { userId, email } = req.auth!;
    await ensureUser(userId, email);
    const { checkoutUrl } = await paymentProvider.createPackageCheckout(
      { userId, email, returnPath: req.body?.returnPath },
      '50-credits',
    );
    res.json({ checkoutUrl });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      console.error(err.message);
      return res.status(503).json({ error: 'Плащанията все още не са налични.' });
    }
    next(err);
  }
});

export default router;
