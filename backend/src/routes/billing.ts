import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth';
import { ensureUser } from '../services/users';
import { paymentProvider } from '../services/billing/StripePaymentProvider';
import { BillingNotConfiguredError } from '../services/billing/PaymentProvider';

const router = Router();

/**
 * POST /api/billing/subscribe — Checkout за business абонамент (€5.99/мес).
 */
router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { userId, email } = req.auth!;
    await ensureUser(userId, email);
    const { checkoutUrl } = await paymentProvider.createSubscriptionCheckout({
      userId,
      email,
      returnPath: req.body?.returnPath,
    });
    res.json({ checkoutUrl });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      console.error(err.message);
      return res.status(503).json({ error: 'Плащанията все още не са налични.' });
    }
    next(err);
  }
});

/**
 * POST /api/billing/portal — Stripe Customer Portal, където business
 * потребителят управлява/отменя абонамента си.
 */
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const { userId, email } = req.auth!;
    const user = await ensureUser(userId, email);
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'Няма активен абонамент за управление.' });
    }
    const { portalUrl } = await paymentProvider.createSubscriptionPortal({
      userId,
      email,
      returnPath: req.body?.returnPath,
    });
    res.json({ portalUrl });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      console.error(err.message);
      return res.status(503).json({ error: 'Плащанията все още не са налични.' });
    }
    next(err);
  }
});

/**
 * POST /api/billing/webhook — Stripe events (fulfilment).
 * Mounted in index.ts with express.raw() BEFORE the global JSON parser —
 * signature verification needs the untouched request body.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: 'Invalid webhook request' });
    return;
  }

  try {
    const result = await paymentProvider.handleWebhook(req.body, signature);
    if (result) console.log(`Stripe webhook fulfilled: ${result.type} for user ${result.userId}`);
    res.json({ received: true });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      console.warn('Stripe webhook: signature verification failed');
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }
    // 5xx makes Stripe retry the delivery — right for transient DB errors.
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

export default router;
