import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { accessCookieName, signAccessToken } from '@/lib/playground/appAccess'
import { findPublishedApp } from '@/lib/playground/publicApp'
import { recordAppPurchase } from '@/lib/playground/appPurchase'

export const runtime = 'nodejs'

/**
 * Where Stripe sends a buyer after a successful checkout.
 *
 * It sets the access cookie and records the grant. The webhook is still the
 * authority — it is the only part of Stripe that fires whether or not the buyer
 * comes back — but waiting for it here would show a paywall to someone who just
 * paid, because the redirect routinely wins that race. So both paths write the
 * same grant, both are idempotent, and whichever arrives first is fine.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const appUrl = new URL(`/play/${token}`, req.nextUrl.origin)

  if (!sessionId || !stripe) {
    appUrl.searchParams.set('purchase', 'unconfirmed')
    return NextResponse.redirect(appUrl)
  }

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.redirect(new URL('/', req.nextUrl.origin))

    const checkout = await stripe.checkout.sessions.retrieve(sessionId)
    const memberId = checkout.metadata?.kanthinkAppUserId
    const paid = checkout.payment_status === 'paid' || checkout.status === 'complete'

    if (!memberId || !paid) {
      appUrl.searchParams.set('purchase', 'unconfirmed')
      return NextResponse.redirect(appUrl)
    }

    const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
    if (!member || member.appId !== app.id) {
      appUrl.searchParams.set('purchase', 'unconfirmed')
      return NextResponse.redirect(appUrl)
    }

    await recordAppPurchase({
      appUserId: member.id,
      amount: checkout.amount_total ?? null,
      currency: checkout.currency ?? null,
      stripeCustomerId: typeof checkout.customer === 'string' ? checkout.customer : null,
      stripeSubscriptionId: typeof checkout.subscription === 'string' ? checkout.subscription : null,
      stripePaymentIntentId: typeof checkout.payment_intent === 'string' ? checkout.payment_intent : null,
    })

    appUrl.searchParams.set('purchase', 'success')
    const res = NextResponse.redirect(appUrl)
    res.cookies.set(accessCookieName(app.id), signAccessToken(member.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return res
  } catch (error) {
    console.error('[play/grant] failed:', error)
    appUrl.searchParams.set('purchase', 'unconfirmed')
    return NextResponse.redirect(appUrl)
  }
}
