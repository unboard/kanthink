import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe, handleSubscriptionUpdate, handleSubscriptionDeleted } from '@/lib/stripe'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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
        await handleSubscriptionUpdate(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

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
