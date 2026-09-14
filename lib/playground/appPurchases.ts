import { db } from '@/lib/db'
import { appPurchases, appUsers } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { isPurchaseActive, type PurchaseRef } from './appAccess'

/**
 * Purchases, as rows of their own.
 *
 * They used to be fields on the customer: one subscription id, one payment intent,
 * one status per email. Two purchases against the same address therefore collided —
 * the second overwrote the first's identifiers, leaving a live Stripe subscription
 * that nothing here could cancel, and refunding either revoked access for both.
 *
 * Everything below follows from one rule: a purchase is the unit of entitlement,
 * and the customer is only who made it.
 */

export type Purchase = typeof appPurchases.$inferSelect

export interface RecordPurchaseInput {
  appId: string
  appUserId: string
  /** The idempotency key. A webhook delivered three times writes one purchase. */
  checkoutSessionId?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePaymentIntentId?: string | null
  amount?: number | null
  currency?: string | null
  interval?: 'one_time' | 'month' | 'year' | null
  accessExpiresAt?: Date | null
}

export interface RecordResult {
  purchase: Purchase
  /** False when this event had already been recorded. Nothing was created. */
  created: boolean
}

/**
 * Write a purchase, once.
 *
 * Stripe delivers webhooks at least once and the redirect races them, so this is
 * called more than once for the same payment as a matter of course. The checkout
 * session is the identity of the event: matching one updates it in place, and only
 * an event never seen before creates a row.
 */
export async function recordPurchase(input: RecordPurchaseInput): Promise<RecordResult> {
  const existing = await findExisting(input)

  const now = new Date()
  if (existing) {
    // Late-arriving detail — a subscription id the redirect did not have, a period
    // end from a renewal — fills gaps without disturbing what is already known.
    await db.update(appPurchases).set({
      stripeCustomerId: input.stripeCustomerId ?? existing.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId ?? existing.stripeSubscriptionId,
      stripePaymentIntentId: input.stripePaymentIntentId ?? existing.stripePaymentIntentId,
      amount: input.amount ?? existing.amount,
      currency: input.currency ?? existing.currency,
      interval: input.interval ?? existing.interval,
      accessExpiresAt: input.accessExpiresAt ?? existing.accessExpiresAt,
      updatedAt: now,
    }).where(eq(appPurchases.id, existing.id))

    const refreshed = await db.query.appPurchases.findFirst({ where: eq(appPurchases.id, existing.id) })
    await refreshMemberStatus(input.appUserId)
    return { purchase: refreshed ?? existing, created: false }
  }

  const id = crypto.randomUUID()
  await db.insert(appPurchases).values({
    id,
    appId: input.appId,
    appUserId: input.appUserId,
    status: 'active',
    stripeCheckoutSessionId: input.checkoutSessionId ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    interval: input.interval ?? null,
    paidAt: now,
    accessExpiresAt: input.accessExpiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  })

  const purchase = await db.query.appPurchases.findFirst({ where: eq(appPurchases.id, id) })
  await refreshMemberStatus(input.appUserId)
  return { purchase: purchase!, created: true }
}

/**
 * The purchase this event belongs to, if we have already seen it.
 *
 * Checked in order of how specific each identifier is. The checkout session names
 * exactly one purchase; a subscription id names the purchase it renews; a payment
 * intent names the one it paid for.
 */
async function findExisting(input: RecordPurchaseInput): Promise<Purchase | null> {
  if (input.checkoutSessionId) {
    const bySession = await db.query.appPurchases.findFirst({
      where: eq(appPurchases.stripeCheckoutSessionId, input.checkoutSessionId),
    })
    if (bySession) return bySession
  }
  if (input.stripeSubscriptionId) {
    const bySub = await db.query.appPurchases.findFirst({
      where: eq(appPurchases.stripeSubscriptionId, input.stripeSubscriptionId),
    })
    if (bySub) return bySub
  }
  if (input.stripePaymentIntentId) {
    const byIntent = await db.query.appPurchases.findFirst({
      where: eq(appPurchases.stripePaymentIntentId, input.stripePaymentIntentId),
    })
    if (byIntent) return byIntent
  }
  return null
}

/**
 * End one purchase.
 *
 * One row, named explicitly. A refund of one purchase says nothing about another
 * that happens to share an email address, and this is where that used to go wrong.
 */
export async function endPurchase(
  purchaseId: string,
  reason: 'refunded' | 'canceled' | 'expired',
): Promise<Purchase | null> {
  const purchase = await db.query.appPurchases.findFirst({ where: eq(appPurchases.id, purchaseId) })
  if (!purchase) return null
  if (purchase.status !== 'active') return purchase

  const now = new Date()
  await db.update(appPurchases)
    .set({ status: reason, endedAt: now, updatedAt: now })
    .where(eq(appPurchases.id, purchaseId))

  await refreshMemberStatus(purchase.appUserId)
  return db.query.appPurchases.findFirst({ where: eq(appPurchases.id, purchaseId) }) as Promise<Purchase>
}

/** Every purchase for one customer. */
export async function purchasesForMember(appUserId: string): Promise<Purchase[]> {
  return db.query.appPurchases.findMany({ where: eq(appPurchases.appUserId, appUserId) })
}

/** Every purchase for one app, for the publisher's ledger. */
export async function purchasesForApp(appId: string): Promise<Purchase[]> {
  return db.query.appPurchases.findMany({ where: eq(appPurchases.appId, appId) })
}

export async function findPurchaseBySubscription(subscriptionId: string): Promise<Purchase | null> {
  const found = await db.query.appPurchases.findFirst({
    where: eq(appPurchases.stripeSubscriptionId, subscriptionId),
  })
  return found ?? null
}

export async function findPurchaseByPaymentIntent(intentId: string): Promise<Purchase | null> {
  const found = await db.query.appPurchases.findFirst({
    where: eq(appPurchases.stripePaymentIntentId, intentId),
  })
  return found ?? null
}

/** Narrow a purchase to what an access decision needs. */
export function toRef(purchase: Purchase): PurchaseRef {
  return { id: purchase.id, status: purchase.status, accessExpiresAt: purchase.accessExpiresAt }
}

/**
 * Recompute the customer row's summary status from their purchases.
 *
 * The publisher's list and the directory counts read that column, so it has to stay
 * true — but it is a roll-up, not a source. Any live purchase means paid; otherwise
 * the most recent ending explains what happened.
 */
export async function refreshMemberStatus(appUserId: string): Promise<void> {
  const purchases = await purchasesForMember(appUserId)
  const now = new Date()

  let status: 'free' | 'paid' | 'refunded' | 'canceled' = 'free'
  if (purchases.some((p) => isPurchaseActive(toRef(p), now))) {
    status = 'paid'
  } else if (purchases.length > 0) {
    const latest = [...purchases].sort(
      (a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0),
    )[0]
    status = latest.status === 'refunded' ? 'refunded' : 'canceled'
  }

  const active = purchases.filter((p) => isPurchaseActive(toRef(p), now))
  const totalPaid = purchases.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  await db.update(appUsers).set({
    status,
    // Kept in step so the audience list and receipts stay readable, and explicitly
    // a summary: the purchase rows are what anything consequential reads.
    amountPaid: totalPaid || null,
    currency: purchases[0]?.currency ?? null,
    paidAt: purchases.find((p) => p.paidAt)?.paidAt ?? null,
    stripeCustomerId: purchases.find((p) => p.stripeCustomerId)?.stripeCustomerId ?? null,
    stripeSubscriptionId: active.find((p) => p.stripeSubscriptionId)?.stripeSubscriptionId ?? null,
    accessExpiresAt: active.find((p) => p.accessExpiresAt)?.accessExpiresAt ?? null,
    updatedAt: now,
  }).where(eq(appUsers.id, appUserId))
}

/** A purchase belonging to this app and this customer, or null. */
export async function findPurchaseForMember(
  purchaseId: string,
  appUserId: string,
): Promise<Purchase | null> {
  const found = await db.query.appPurchases.findFirst({
    where: and(eq(appPurchases.id, purchaseId), eq(appPurchases.appUserId, appUserId)),
  })
  return found ?? null
}
