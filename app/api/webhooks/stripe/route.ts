import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe, handleSubscriptionUpdate, handleSubscriptionDeleted } from '@/lib/stripe'
import { db } from '@/lib/db'
import { appUsers, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  findMemberBySubscription,
  recordAppPurchase,
  revokeAppAccess,
} from '@/lib/playground/appPurchase'
import {
  sendSubscriptionConfirmedEmail,
  sendSubscriptionCanceledEmail,
  sendPaymentFailedEmail,
} from '@/lib/emails/send'

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not configured' },
      { status: 503 }
    )
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // A published app being bought. These sessions carry the app and the buyer
        // in their metadata, and have nothing to do with Kanthink subscriptions —
        // handle them and stop, so an app purchase can never upgrade someone's tier.
        if (session.metadata?.kanthinkAppUserId) {
          await recordAppPurchase({
            appUserId: session.metadata.kanthinkAppUserId,
            amount: session.amount_total ?? null,
            currency: session.currency ?? null,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            accessExpiresAt: typeof session.subscription === 'string'
              ? await subscriptionPeriodEnd(session.subscription)
              : null,
          })
          break
        }

        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          await handleSubscriptionUpdate(subscription)

          // Send subscription confirmed email
          const customerId = subscription.customer as string
          const user = await db.query.users.findFirst({
            where: eq(users.stripeCustomerId, customerId),
            columns: { email: true, name: true, tier: true },
          })
          if (user?.email) {
            sendSubscriptionConfirmedEmail(user.email, {
              userName: user.name || '',
              tier: user.tier || 'premium',
            }).catch(() => {})
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription

        // A recurring app subscription, not a Kanthink plan. Renewals push the
        // access expiry out; anything that is no longer active takes access away.
        const appMember = await findMemberBySubscription(subscription.id)
        if (appMember) {
          const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            await recordAppPurchase({
              appUserId: appMember.id,
              amount: appMember.amountPaid ?? null,
              currency: appMember.currency ?? null,
              accessExpiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
            })
          } else if (subscription.status !== 'past_due') {
            // past_due keeps access during Stripe's own retry window.
            await revokeAppAccess(appMember.id, 'canceled')
          }
          break
        }

        await handleSubscriptionUpdate(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        const endedAppMember = await findMemberBySubscription(subscription.id)
        if (endedAppMember) {
          await revokeAppAccess(endedAppMember.id, 'canceled')
          break
        }

        // Send cancellation email before resetting tier
        const cancelCustomerId = subscription.customer as string
        const cancelUser = await db.query.users.findFirst({
          where: eq(users.stripeCustomerId, cancelCustomerId),
          columns: { email: true, name: true, currentPeriodEnd: true },
        })
        if (cancelUser?.email) {
          const endDate = cancelUser.currentPeriodEnd
            ? cancelUser.currentPeriodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'your current billing period'
          sendSubscriptionCanceledEmail(cancelUser.email, {
            userName: cancelUser.name || '',
            endDate,
          }).catch(() => {})
        }

        await handleSubscriptionDeleted(subscription)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn(`Payment failed for invoice: ${invoice.id}`)

        const failedCustomerId = invoice.customer as string
        if (failedCustomerId) {
          const failedUser = await db.query.users.findFirst({
            where: eq(users.stripeCustomerId, failedCustomerId),
            columns: { email: true, name: true },
          })
          if (failedUser?.email) {
            sendPaymentFailedEmail(failedUser.email, {
              userName: failedUser.name || '',
              settingsUrl: `${process.env.NEXTAUTH_URL || 'https://kanthink.com'}/settings`,
            }).catch(() => {})
          }
        }
        break
      }

      case 'charge.refunded': {
        // A refunded app purchase loses access on the next page load. The row stays
        // — a publisher asking "who used this" wants to see the refund, not a gap.
        const charge = event.data.object as Stripe.Charge
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
        if (intentId) {
          const refunded = await db.query.appUsers.findFirst({
            where: eq(appUsers.stripePaymentIntentId, intentId),
          })
          if (refunded) await revokeAppAccess(refunded.id, 'refunded')
        }
        break
      }

      default:
        // Ignore unhandled event types
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

/**
 * When a newly-bought app subscription's first period ends.
 *
 * The checkout session does not carry it, and access with no expiry on a monthly
 * plan is access that never lapses.
 */
async function subscriptionPeriodEnd(subscriptionId: string): Promise<Date | null> {
  if (!stripe) return null
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const end = (subscription as unknown as { current_period_end?: number }).current_period_end
    return end ? new Date(end * 1000) : null
  } catch {
    return null
  }
}
