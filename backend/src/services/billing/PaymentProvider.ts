/**
 * Payment extension point (Phase 2´, milestone 2 — not yet implemented).
 * Stripe is the planned default; keep implementations behind this interface
 * in case a Bulgarian/EU processor is preferred later. See docs/ACCOUNTS.md.
 */
export type CreditPackage = '50-credits';

export interface PaymentEvent {
  type: 'package_purchased' | 'subscription_started' | 'subscription_renewed' | 'subscription_canceled';
  userId: string;
  creditsGranted?: number;
}

export interface PaymentProvider {
  createPackageCheckout(userId: string, pkg: CreditPackage): Promise<{ checkoutUrl: string }>;
  createSubscriptionCheckout(userId: string): Promise<{ checkoutUrl: string }>;
  handleWebhook(payload: unknown, signature: string): Promise<PaymentEvent>;
}
