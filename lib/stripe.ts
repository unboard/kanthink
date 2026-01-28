import Stripe from 'stripe'
import { db } from './db'
import { users } from './db/schema'
import { eq } from 'drizzle-orm'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set - Stripe features will be disabled')
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

export const STRIPE_PRICES = {
  premium: process.env.STRIPE_PREMIUM_PRICE_ID || '',
}

/**
 * Create or retrieve a Stripe customer for a user
 */
export async function getOrCreateCustomer(userId: string, email: string, name?: string | null): Promise<string | null> {
  if (!stripe) return null

  // Check if user already has a customer ID
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId,
    },
  })

  // Save customer ID to user
  await db.update(users)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  return customer.id
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  name?: string | null,
  returnUrl?: string
): Promise<string | null> {
  if (!stripe || !STRIPE_PRICES.premium) {
    return null
  }

  const customerId = await getOrCreateCustomer(userId, email, name)
  if (!customerId) return null

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: STRIPE_PRICES.premium,
        quantity: 1,
      },
    ],
    success_url: `${returnUrl || process.env.NEXTAUTH_URL}/settings?checkout=success`,
    cancel_url: `${returnUrl || process.env.NEXTAUTH_URL}/settings?checkout=canceled`,
    metadata: {
      userId,
    },
  })

  return session.url
}

/**
 * Create a billing portal session for managing subscription
 */
export async function createPortalSession(
  customerId: string,
  returnUrl?: string
): Promise<string | null> {
  if (!stripe) return null

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || `${process.env.NEXTAUTH_URL}/settings`,
  })

  return session.url
}

/**
 * Handle subscription updates from Stripe webhooks
 */
export async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string

  // Find user by customer ID
  const user = await db.query.users.findFirst({
    where: eq(users.stripeCustomerId, customerId),
  })

  if (!user) {
    console.error(`No user found for Stripe customer: ${customerId}`)
    return
  }

  // Determine tier and status
  let tier: 'free' | 'premium' = 'free'
  let subscriptionStatus: 'free' | 'active' | 'canceled' | 'past_due' = 'free'

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    tier = 'premium'
    subscriptionStatus = 'active'
  } else if (subscription.status === 'canceled') {
    subscriptionStatus = 'canceled'
  } else if (subscription.status === 'past_due') {
    tier = 'premium' // Still give access during grace period
    subscriptionStatus = 'past_due'
  }

  // Get the current period end (using type assertion for compatibility)
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end

  // Update user
  await db.update(users)
    .set({
      subscriptionId: subscription.id,
      subscriptionStatus,
      tier,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
}

/**
 * Handle subscription deletion from Stripe webhooks
 */
export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string

  // Find user by customer ID
  const user = await db.query.users.findFirst({
    where: eq(users.stripeCustomerId, customerId),
  })

  if (!user) {
    console.error(`No user found for Stripe customer: ${customerId}`)
    return
  }

  // Reset to free tier
  await db.update(users)
    .set({
      subscriptionId: null,
      subscriptionStatus: 'free',
      tier: 'free',
      currentPeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
}
