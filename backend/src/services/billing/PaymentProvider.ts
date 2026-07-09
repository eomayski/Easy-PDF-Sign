/**
 * Payment extension point (Phase 2´, milestone 2).
 * Stripe is the default implementation (StripePaymentProvider.ts); keep new
 * implementations behind this interface in case a Bulgarian/EU processor is
 * preferred later. See docs/ACCOUNTS.md.
 */
export type CreditPackage = '50-credits';

export interface CheckoutContext {
  userId: string;
  email: string;
  /** In-app path to return to after checkout (default /sign). */
  returnPath?: string;
}

export interface PaymentEvent {
  type:
    | 'package_purchased'
    | 'subscription_started'
    | 'subscription_updated'
    | 'subscription_canceled';
  userId: string;
  creditsGranted?: number;
}

export interface PaymentProvider {
  createPackageCheckout(ctx: CheckoutContext, pkg: CreditPackage): Promise<{ checkoutUrl: string }>;
  createSubscriptionCheckout(ctx: CheckoutContext): Promise<{ checkoutUrl: string }>;
  /** Hosted page where a business user manages/cancels the subscription. */
  createSubscriptionPortal(ctx: CheckoutContext): Promise<{ portalUrl: string }>;
  /**
   * Verifies and fulfils a provider webhook (credit grants, subscription
   * state changes). Returns null for event types we deliberately ignore.
   * Fulfilment must be idempotent — providers retry deliveries.
   */
  handleWebhook(rawBody: Buffer, signature: string): Promise<PaymentEvent | null>;
}

/** Thrown when the provider env vars are missing — routes map this to 503. */
export class BillingNotConfiguredError extends Error {
  constructor(varName: string) {
    super(`Billing is not configured: missing ${varName}`);
    this.name = 'BillingNotConfiguredError';
  }
}
