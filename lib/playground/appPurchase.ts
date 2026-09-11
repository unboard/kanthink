import { db } from '@/lib/db'
import { appUsers, playgroundApps } from '@/lib/db/schema'
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
export interface RecordPurchaseInput {
  appUserId: string
  amount: number | null
  currency: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePaymentIntentId?: string | null
  /** For subscriptions: when the paid-for period runs out. */
  accessExpiresAt?: Date | null
}

export async function recordAppPurchase(input: RecordPurchaseInput): Promise<void> {
  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, input.appUserId) })
  if (!member) return

  const alreadyPaid = member.status === 'paid'
  const now = new Date()

  await db.update(appUsers).set({
    status: 'paid',
    // Keep the first paidAt. A renewal is not a new purchase, and the publisher's
    // list is more useful ordered by when someone became a customer.
    paidAt: member.paidAt ?? now,
    amountPaid: input.amount ?? member.amountPaid,
    currency: input.currency ?? member.currency,
    stripeCustomerId: input.stripeCustomerId ?? member.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId ?? member.stripeSubscriptionId,
    stripePaymentIntentId: input.stripePaymentIntentId ?? member.stripePaymentIntentId,
    accessExpiresAt: input.accessExpiresAt ?? member.accessExpiresAt,
    updatedAt: now,
  }).where(eq(appUsers.id, member.id))

  // Only the transition is worth telling anyone about.
  if (alreadyPaid) return

  const app = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, member.appId),
    columns: { id: true, title: true, shareToken: true },
  })
  if (!app) return

  await createNotification({
    userId: member.ownerId,
    type: 'app_purchase',
    title: `${member.name || member.email} bought ${app.title}`,
    body: `${formatAppPrice(input.amount, input.currency, null)} · ${member.email}`,
    data: { appId: app.id, appUserId: member.id, kind: 'app_purchase' },
  })

  // The buyer's receipt. Best-effort: a failed email must never undo a grant that
  // has already been paid for, so nothing here is allowed to throw upward.
  if (app.shareToken) {
    const appUrl = `${siteOrigin()}/play/${app.shareToken}`
    // Only a subscription has anything to manage. The link points at our own
    // route rather than a Stripe portal session, because a session URL is
    // short-lived and single-use — one sitting in an inbox for a month is dead.
    // The signed key identifies the buyer on a device that has never had a cookie.
    const manageBillingUrl = input.stripeSubscriptionId && input.stripeCustomerId
      ? `${siteOrigin()}/api/play/${app.shareToken}/billing?k=${signAccessToken(member.id)}`
      : undefined

    void sendAppPurchasedEmail(member.email, {
      buyerName: member.name || '',
      appTitle: app.title,
      amount: formatAppPrice(input.amount, input.currency, null),
      appUrl,
      manageBillingUrl,
    }).catch(() => {})
  }
}

/**
 * Access ending — a refund, or a subscription that lapsed.
 *
 * The row stays. A publisher asking "who has used this" wants the person who
 * cancelled in the list, marked as cancelled, not silently gone.
 */
export async function revokeAppAccess(
  appUserId: string,
  reason: 'refunded' | 'canceled',
): Promise<void> {
  await db.update(appUsers)
    .set({ status: reason, accessExpiresAt: new Date(), updatedAt: new Date() })
    .where(eq(appUsers.id, appUserId))
}

/** The `app_users` row a Stripe subscription belongs to, if any. */
export async function findMemberBySubscription(subscriptionId: string) {
  return db.query.appUsers.findFirst({
    where: eq(appUsers.stripeSubscriptionId, subscriptionId),
  })
}
