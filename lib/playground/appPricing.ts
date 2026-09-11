import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

/**
 * Charging for a published app.
 *
 * The money goes to the Kanthink Stripe account — there is no Connect onboarding
 * here, so this is "the operator of this instance can sell the apps they publish",
 * not a marketplace that pays out to arbitrary third parties. That limit is
 * deliberate: Connect means KYC, payouts and a whole compliance surface, and none
 * of it is needed to answer the actual question, which was "let me cover the AI
 * cost of an app I put on the internet".
 *
 * Stripe prices are immutable. Changing an app's price therefore mints a new one
 * and archives the old, which is also what keeps existing subscribers on the terms
 * they agreed to.
 */

export interface AppPriceInput {
  /** Minor units. 400 is $4.00. */
  amount: number;
  currency: string;
  interval: 'one_time' | 'month' | 'year';
}

export interface AppPriceResult {
  productId: string;
  priceId: string;
}

export interface PricedApp {
  id: string;
  title: string;
  tagline?: string | null;
  summary?: string | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
}

export class PricingUnavailableError extends Error {
  constructor(message = 'Payments are not configured on this instance.') {
    super(message);
    this.name = 'PricingUnavailableError';
  }
}

/**
 * Stripe refused us, rather than refusing the price.
 *
 * Worth its own type because the fix is in the deployment's environment, not in
 * anything the person setting a price can do. A revoked or rotated key fails every
 * call here identically, and reporting that as "could not save the price" sends
 * someone hunting through a form that was never the problem.
 */
export class PricingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingAuthError';
  }
}

/**
 * Is this Stripe refusing *us*, rather than refusing the price?
 *
 * Returns the sentence to show, or null when the error is about the request and
 * should be reported as-is. Pure and exported so the classification can be tested
 * without a Stripe account — it is the part that decides whether someone spends an
 * afternoon re-typing a valid price into a form that was never the problem.
 */
export function stripeFailureMessage(error: unknown): string | null {
  const type = (error as { type?: string } | null | undefined)?.type;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (type === 'StripeAuthenticationError' || /invalid api key|no api key provided/i.test(message)) {
    return 'Stripe rejected this deployment\u2019s API key. It has most likely been rotated or revoked \u2014 update STRIPE_SECRET_KEY.';
  }
  if (type === 'StripePermissionError' || /does not have (the required )?permission/i.test(message)) {
    return 'This deployment\u2019s Stripe key does not have permission to create products.';
  }
  if (type === 'StripeConnectionError' || type === 'StripeAPIError') {
    return 'Stripe could not be reached. Try again in a moment.';
  }
  return null;
}

/** Re-throw a Stripe error as something a caller can report usefully. */
function rethrowStripe(error: unknown): never {
  const message = stripeFailureMessage(error);
  if (message) throw new PricingAuthError(message);
  throw error;
}

/** Reject nonsense before it reaches Stripe, where the error is less legible. */
export function validatePriceInput(input: Partial<AppPriceInput>): AppPriceInput {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 50) {
    // Stripe's own floor for most currencies is 50 minor units; below it the
    // charge fails at payment time rather than at configuration time.
    throw new Error('The price must be at least 0.50 in the chosen currency.');
  }
  if (amount > 100_000_00) {
    throw new Error('That price looks like a typo. Keep it under 100,000.');
  }
  const currency = (input.currency || 'usd').toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error('Currency must be a three-letter code, like usd or gbp.');
  }
  const interval = input.interval || 'one_time';
  if (interval !== 'one_time' && interval !== 'month' && interval !== 'year') {
    throw new Error('Billing must be one-time, monthly or yearly.');
  }
  return { amount, currency, interval };
}

/**
 * Make sure Stripe holds a product and an active price matching what the owner set.
 *
 * Reuses the existing price when nothing material changed, so saving the settings
 * pane twice does not litter the Stripe dashboard with identical prices.
 */
export async function syncAppPrice(app: PricedApp, input: AppPriceInput): Promise<AppPriceResult> {
  if (!stripe) throw new PricingUnavailableError();
  try {
    return await syncAppPriceInner(app, input);
  } catch (error) {
    return rethrowStripe(error);
  }
}

async function syncAppPriceInner(app: PricedApp, input: AppPriceInput): Promise<AppPriceResult> {
  if (!stripe) throw new PricingUnavailableError();

  const description = app.tagline?.trim() || app.summary?.trim() || undefined;

  let productId = app.stripeProductId || null;
  if (productId) {
    try {
      await stripe.products.update(productId, { name: app.title, description });
    } catch {
      // The product was deleted in the dashboard, or belongs to another account
      // after a key rotation. Either way, make a fresh one rather than failing.
      productId = null;
    }
  }
  if (!productId) {
    const product = await stripe.products.create({
      name: app.title,
      description,
      metadata: { kanthinkAppId: app.id },
    });
    productId = product.id;
  }

  // Is the price we already have the price we want?
  if (app.stripePriceId) {
    try {
      const existing = await stripe.prices.retrieve(app.stripePriceId);
      if (
        existing.active &&
        existing.product === productId &&
        existing.unit_amount === input.amount &&
        existing.currency === input.currency &&
        matchesInterval(existing, input.interval)
      ) {
        return { productId, priceId: existing.id };
      }
      // Archive rather than delete: Stripe keeps the history, and anyone already
      // subscribed on the old price stays on it.
      if (existing.active) await stripe.prices.update(existing.id, { active: false });
    } catch {
      // Unretrievable price — fall through and mint a new one.
    }
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: input.amount,
    currency: input.currency,
    ...(input.interval === 'one_time'
      ? {}
      : { recurring: { interval: input.interval } }),
    metadata: { kanthinkAppId: app.id },
  });

  return { productId, priceId: price.id };
}

function matchesInterval(price: Stripe.Price, interval: AppPriceInput['interval']): boolean {
  if (interval === 'one_time') return !price.recurring;
  return price.recurring?.interval === interval;
}

export interface AppCheckoutInput {
  appId: string;
  appUserId: string;
  priceId: string;
  interval: 'one_time' | 'month' | 'year';
  email: string;
  /**
   * Where Stripe sends a successful buyer. This is the grant route rather than the
   * app itself: the buyer needs a cookie before the app will open for them, and a
   * server component cannot set one.
   */
  successUrl: string;
  /** Back to the app's public page, unbought. */
  cancelUrl: string;
}

/**
 * The buyer's checkout session.
 *
 * `kanthinkAppUserId` in the metadata is what the webhook uses to grant access, so
 * the row must exist before checkout starts. That ordering is deliberate: a person
 * who abandons checkout still shows up in the publisher's audience as someone who
 * looked, which is a more useful list than one only containing buyers.
 */
export async function createAppCheckoutSession(input: AppCheckoutInput): Promise<string | null> {
  if (!stripe) throw new PricingUnavailableError();

  try {
    return await createAppCheckoutSessionInner(input);
  } catch (error) {
    return rethrowStripe(error);
  }
}

async function createAppCheckoutSessionInner(input: AppCheckoutInput): Promise<string | null> {
  const session = await stripe!.checkout.sessions.create({
    mode: input.interval === 'one_time' ? 'payment' : 'subscription',
    customer_email: input.email,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      kanthinkAppId: input.appId,
      kanthinkAppUserId: input.appUserId,
    },
    // Subscriptions carry their own metadata bag; the webhook for a renewal never
    // sees the checkout session, so the ids have to ride on the subscription too.
    ...(input.interval === 'one_time'
      ? { payment_intent_data: { metadata: { kanthinkAppId: input.appId, kanthinkAppUserId: input.appUserId } } }
      : { subscription_data: { metadata: { kanthinkAppId: input.appId, kanthinkAppUserId: input.appUserId } } }),
  });

  return session.url;
}
