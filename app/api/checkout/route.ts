import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createCheckoutSession, createPortalSession, stripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Check if Stripe is configured
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { action } = body

    if (action === 'portal') {
      // Get user's Stripe customer ID
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      })

      if (!user?.stripeCustomerId) {
        return NextResponse.json(
          { error: 'No billing account found' },
          { status: 404 }
        )
      }

      const portalUrl = await createPortalSession(user.stripeCustomerId)
      if (!portalUrl) {
        return NextResponse.json(
          { error: 'Failed to create billing portal session' },
          { status: 500 }
        )
      }

      return NextResponse.json({ url: portalUrl })
    }

    // Default: create checkout session
    const checkoutUrl = await createCheckoutSession(
      session.user.id,
      session.user.email,
      session.user.name
    )

    if (!checkoutUrl) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: checkoutUrl })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
