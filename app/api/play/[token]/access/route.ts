import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import {
  accessCookieName,
  hasActiveAccess,
  isPaywalled,
  signAccessToken,
  verifyAccessToken,
} from '@/lib/playground/appAccess'
import { createAppCheckoutSession, PricingAuthError, PricingUnavailableError } from '@/lib/playground/appPricing'
import { ensureAppUser, findAppOwnerId, findPublishedApp, requestOrigin } from '@/lib/playground/publicApp'

export const runtime = 'nodejs'

/**
 * "Let me in" on a published app.
 *
 * The visitor gives an email. Three things can happen:
 *   - the app is free → they get an access cookie and the app opens;
 *   - they have already paid → same, no second charge;
 *   - it costs money and they have not paid → a Stripe checkout URL.
 *
 * The `app_users` row is written before checkout starts, on purpose. Someone who
 * abandons checkout still shows up in the publisher's audience as a person who
 * looked, which is a more useful list than one containing only buyers.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let body: { email?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ownerId = await findAppOwnerId(app)
    const member = await ensureAppUser({ appId: app.id, ownerId, email, name: body.name })

    if (hasActiveAccess(app, member)) {
      return grantResponse(app.id, member.id)
    }

    if (!isPaywalled(app)) {
      // Belt and braces: hasActiveAccess already returns true for an unpaywalled
      // app, so reaching here means the paywall is on but unbuyable.
      return NextResponse.json(
        { error: 'This app is not currently available to buy.' },
        { status: 503 },
      )
    }

    const origin = await requestOrigin()
    const url = await createAppCheckoutSession({
      appId: app.id,
      appUserId: member.id,
      priceId: app.stripePriceId!,
      interval: app.priceInterval || 'one_time',
      email,
      successUrl: `${origin}/api/play/${token}/grant?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/play/${token}?purchase=canceled`,
    })

    if (!url) {
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 })
    }
    return NextResponse.json({ checkoutUrl: url })
  } catch (error) {
    if (error instanceof PricingUnavailableError || error instanceof PricingAuthError) {
      // The buyer is not told whose key is broken — only that they cannot pay yet.
      console.error('[play/access] checkout unavailable:', error.message)
      return NextResponse.json(
        { error: 'Payments are temporarily unavailable for this app. Try again later.' },
        { status: 503 },
      )
    }
    console.error('[play/access] POST failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}

/**
 * The access cookie.
 *
 * A year, httpOnly, lax — long enough that a one-time purchase does not feel like a
 * rental, and the token is checked against the row on every load anyway, so a refund
 * takes effect immediately regardless of how long the cookie lives.
 */
function grantResponse(appId: string, memberId: string) {
  const res = NextResponse.json({ granted: true })
  res.cookies.set(accessCookieName(appId), signAccessToken(memberId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}

/**
 * Mark a return visit.
 *
 * Called by the public page once it has decided to render the app. Only the holder
 * of the access cookie is counted — usage the publisher sees should mean "this
 * person opened it", not "somebody did".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const memberId = verifyAccessToken(req.cookies.get(accessCookieName(app.id))?.value)
    if (!memberId) return NextResponse.json({ ok: false })

    const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
    if (!member || member.appId !== app.id) return NextResponse.json({ ok: false })

    await db.update(appUsers)
      .set({ sessionCount: member.sessionCount + 1, lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(appUsers.id, memberId))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
