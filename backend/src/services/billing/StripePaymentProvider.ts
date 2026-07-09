import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import {
  BillingNotConfiguredError,
  type CheckoutContext,
  type CreditPackage,
  type PaymentEvent,
  type PaymentProvider,
} from './PaymentProvider';

const PACKAGE_CREDITS: Record<CreditPackage, number> = { '50-credits': 50 };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new BillingNotConfiguredError(name);
  return value;
}

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) client = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  return client;
}

/** First entry of FRONTEND_ORIGIN (comma-separated CORS allow-list). */
function frontendBase(): string {
  const origins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173').split(',');
  return origins[0].trim().replace(/\/$/, '');
}

/** Only allow simple in-app paths — never redirect to an arbitrary URL. */
function safeReturnPath(path?: string): string {
  return path && /^\/[\w\-./]*$/.test(path) ? path : '/sign';
}

function returnUrls(ctx: CheckoutContext): { success_url: string; cancel_url: string } {
  const base = frontendBase() + safeReturnPath(ctx.returnPath);
  return { success_url: `${base}?billing=success`, cancel_url: `${base}?billing=cancelled` };
}

/**
 * Reuses the stored Stripe customer or creates one keyed to our user id.
 * The stored id is verified against Stripe first: a customer created in test
 * mode doesn't exist for a live key (and vice versa), so switching modes would
 * otherwise permanently break checkout for that user — recreate instead.
 */
async function getOrCreateCustomer(ctx: CheckoutContext): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });

  if (user.stripeCustomerId) {
    try {
      const existing = await stripe().customers.retrieve(user.stripeCustomerId);
      if (!existing.deleted) return user.stripeCustomerId;
    } catch (err) {
      const missing =
        err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing';
      if (!missing) throw err;
      console.warn(
        `Stripe customer ${user.stripeCustomerId} not found in this mode — recreating for user ${ctx.userId}`,
      );
    }
  }

  const customer = await stripe().customers.create({
    email: ctx.email,
    metadata: { userId: ctx.userId },
  });
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

function customerId(sub: Stripe.Subscription): string {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
}

/** Basil API (2025-03-31+) moved current_period_end to the subscription items. */
function renewsAt(sub: Stripe.Subscription): Date | null {
  const end = sub.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

async function findUserForSubscription(sub: Stripe.Subscription) {
  const metaUserId = sub.metadata?.userId;
  if (metaUserId) {
    const user = await prisma.user.findUnique({ where: { id: metaUserId } });
    if (user) return user;
  }
  return prisma.user.findUnique({ where: { stripeCustomerId: customerId(sub) } });
}

/**
 * Projects the Stripe subscription state onto our User row. Pure state sync
 * (no counters), so webhook retries and out-of-order deliveries are safe.
 */
async function applySubscriptionState(
  sub: Stripe.Subscription,
  deleted = false,
): Promise<PaymentEvent | null> {
  const user = await findUserForSubscription(sub);
  if (!user) {
    console.warn(`Stripe webhook: no user for subscription ${sub.id}`);
    return null;
  }

  // A newer subscription may already be attached (e.g. canceled → resubscribed
  // → late retry of an event for the old sub) — ignore stale subscriptions.
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id && deleted) return null;

  const active = !deleted && (sub.status === 'active' || sub.status === 'trialing');
  const status = active ? 'active' : sub.status === 'past_due' && !deleted ? 'past_due' : 'canceled';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accountType: status === 'canceled' ? 'free' : 'business',
      subscriptionStatus: status,
      subscriptionRenewsAt: status === 'canceled' ? null : renewsAt(sub),
      stripeSubscriptionId: status === 'canceled' ? null : sub.id,
      stripeCustomerId: user.stripeCustomerId ?? customerId(sub),
    },
  });

  return {
    type: status === 'canceled' ? 'subscription_canceled' : 'subscription_updated',
    userId: user.id,
  };
}

/** Credits a package purchase exactly once per webhook event (P2002 on retry). */
async function grantPackageCredits(
  userId: string,
  credits: number,
  eventId: string,
): Promise<boolean> {
  try {
    await prisma.$transaction([
      prisma.creditTransaction.create({
        data: { userId, delta: credits, reason: 'package_purchase', stripeEventId: eventId },
      }),
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: credits } } }),
    ]);
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false; // retry of an already-fulfilled event
    }
    throw err;
  }
}

export class StripePaymentProvider implements PaymentProvider {
  async createPackageCheckout(
    ctx: CheckoutContext,
    pkg: CreditPackage,
  ): Promise<{ checkoutUrl: string }> {
    const price = requireEnv('STRIPE_PRICE_CREDITS_50');
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer: await getOrCreateCustomer(ctx),
      line_items: [{ price, quantity: 1 }],
      client_reference_id: ctx.userId,
      metadata: { userId: ctx.userId, package: pkg },
      ...returnUrls(ctx),
    });
    if (!session.url) throw new Error('Stripe returned a checkout session without a URL');
    return { checkoutUrl: session.url };
  }

  async createSubscriptionCheckout(ctx: CheckoutContext): Promise<{ checkoutUrl: string }> {
    const price = requireEnv('STRIPE_PRICE_BUSINESS_MONTHLY');
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: await getOrCreateCustomer(ctx),
      line_items: [{ price, quantity: 1 }],
      client_reference_id: ctx.userId,
      subscription_data: { metadata: { userId: ctx.userId } },
      ...returnUrls(ctx),
    });
    if (!session.url) throw new Error('Stripe returned a checkout session without a URL');
    return { checkoutUrl: session.url };
  }

  async createSubscriptionPortal(ctx: CheckoutContext): Promise<{ portalUrl: string }> {
    requireEnv('STRIPE_SECRET_KEY');
    const session = await stripe().billingPortal.sessions.create({
      customer: await getOrCreateCustomer(ctx),
      return_url: frontendBase() + safeReturnPath(ctx.returnPath),
    });
    return { portalUrl: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<PaymentEvent | null> {
    const event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET'),
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? session.client_reference_id;
        if (!userId) {
          console.warn(`Stripe webhook: checkout session ${session.id} has no userId`);
          return null;
        }

        if (session.mode === 'payment') {
          const pkg = (session.metadata?.package ?? '50-credits') as CreditPackage;
          const credits = PACKAGE_CREDITS[pkg] ?? PACKAGE_CREDITS['50-credits'];
          const granted = await grantPackageCredits(userId, credits, event.id);
          return granted ? { type: 'package_purchased', userId, creditsGranted: credits } : null;
        }

        if (session.mode === 'subscription' && typeof session.subscription === 'string') {
          const sub = await stripe().subscriptions.retrieve(session.subscription);
          const applied = await applySubscriptionState(sub);
          return applied && { type: 'subscription_started', userId };
        }
        return null;
      }

      case 'customer.subscription.updated':
        return applySubscriptionState(event.data.object as Stripe.Subscription);

      case 'customer.subscription.deleted':
        return applySubscriptionState(event.data.object as Stripe.Subscription, true);

      default:
        return null; // event types we don't act on — acknowledge and ignore
    }
  }
}

export const paymentProvider: PaymentProvider = new StripePaymentProvider();
