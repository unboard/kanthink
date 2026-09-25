import { db } from '@/lib/db'
import { appUsers, playgroundApps } from '@/lib/db/schema'
import { recordPurchase } from './appPurchases'
import { eq } from 'drizzle-orm'
import { createNotification } from '@/lib/notifications/createNotification'
import { formatAppPrice, signAccessToken } from '@/lib/playground/appAccess'
import { sendAppPurchasedEmail } from '@/lib/emails/send'

/**
 * The absolute origin for links in emails.
 *
 * Unlike the checkout redirect, which uses the request's own host, this runs from a
 * webhook with no incoming request to read a host off — so the configured
 * deployment URL is the only honest answer available.
 */
function siteOrigin(): string {
  return process.env.NEXTAUTH_URL || 'https://kanthink.com'
}

/**
 * Recording that someone bought an app.
 *
 * Two things call this and they race: the redirect back from checkout, and the
 * Stripe webhook. The redirect usually wins, and when it does not the buyer would
 * otherwise be looking at a paywall for something they have already paid for. So
 * both write the same grant and this function is idempotent — a second call with
 * the same facts changes nothing and notifies nobody.
 */
export interface AppPurchaseEvent {
  appUserId: string
  /** The idempotency key — a webhook delivered twice must not pay twice. */
  checkoutSessionId?: string | null
  amount: number | null
  currency: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePaymentIntentId?: string | null
  interval?: 'one_time' | 'month' | 'year' | null
  /** For subscriptions: when the paid-for period runs out. */
  accessExpiresAt?: Date | null
}

/**
 * Record that someone bought an app.
 *
 * Two things call this and they race: the redirect back from checkout, and the
 * Stripe webhook. The redirect usually wins, and when it does not the buyer would
 * be looking at a paywall for something they have already paid for. Both write the
 * same purchase, keyed on the checkout session, so whichever arrives first wins and
 * the other updates it in place.
 *
 * Returns the purchase, because the caller needs to mint a session naming it.
 */
export async function recordAppPurchase(event: AppPurchaseEvent) {
  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, event.appUserId) })
  if (!member) return null

  const { purchase, created } = await recordPurchase({
    appId: member.appId,
    appUserId: member.id,
    checkoutSessionId: event.checkoutSessionId,
    stripeCustomerId: event.stripeCustomerId,
    stripeSubscriptionId: event.stripeSubscriptionId,
    stripePaymentIntentId: event.stripePaymentIntentId,
    amount: event.amount,
    currency: event.currency,
    interval: event.interval,
    accessExpiresAt: event.accessExpiresAt,
  })

  // Only a purchase that is new to us is worth telling anyone about. A redelivered
  // webhook must not notify the publisher twice or send a second receipt.
  if (!created) return purchase

  const app = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, member.appId),
    columns: { id: true, title: true, shareToken: true },
  })
  if (!app) return purchase

  await createNotification({
    userId: member.ownerId,
    type: 'app_purchase',
    title: `${member.name || member.email} bought ${app.title}`,
    body: `${formatAppPrice(event.amount, event.currency, null)} · ${member.email}`,
    data: { appId: app.id, appUserId: member.id, purchaseId: purchase.id, kind: 'app_purchase' },
  })

  // The buyer's receipt. Best-effort: a failed email must never undo a grant that
  // has already been paid for, so nothing here is allowed to throw upward.
  if (app.shareToken) {
    const appUrl = `${siteOrigin()}/play/${app.shareToken}`
    // The key identifies the buyer on a device that has never had a cookie, and it
    // carries verified scope because it is delivered to the inbox itself — following
    // a link only that mailbox received proves the address, exactly as a code does.
    const manageBillingUrl = event.stripeSubscriptionId && event.stripeCustomerId
      ? `${siteOrigin()}/api/play/${app.shareToken}/billing?k=${signAccessToken(member.id, member.sessionEpoch ?? 0, 'verified')}`
      : undefined

    void sendAppPurchasedEmail(member.email, {
      buyerName: member.name || '',
      appTitle: app.title,
      amount: formatAppPrice(event.amount, event.currency, null),
      appUrl,
      manageBillingUrl,
    }).catch(() => {})
  }

  return purchase
}

/**
 * Has this checkout actually been paid for?
 *
 * `status: 'complete'` is not the same thing. For payment methods that settle later
 * (bank debits and transfers) Stripe completes the checkout while the money is still
 * pending, and grants access on that alone meant access for a payment that could
 * still fail. Such a checkout is granted by `checkout.session.async_payment_succeeded`
 * instead, once it clears. A 100%-off coupon or a free trial needs no payment.
 */
export function checkoutIsPaid(session: { payment_status?: string | null }): boolean {
  return session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
}

/** The billing interval a checkout was for, from the metadata set when it was created. */
export function checkoutInterval(session: { mode?: string | null; metadata?: Record<string, string> | null }): 'one_time' | 'month' | 'year' {
  if (session.mode !== 'subscription') return 'one_time'
  // Sessions created before the interval rode along are monthly: that was the only
  // recurring option at the time.
  return session.metadata?.kanthinkInterval === 'year' ? 'year' : 'month'
}

/*
 * There is deliberately no "revoke this customer's access" helper.
 *
 * There was one, and it set a status on the customer row — so refunding one
 * purchase revoked every purchase that shared the email address. Ending a purchase
 * is endPurchase() in appPurchases, which touches exactly one row.
 */
