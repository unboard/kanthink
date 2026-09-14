import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import {
  accessCookieName,
  isPaywalled,
  signAccessToken,
  type AccessScope,
} from '@/lib/playground/appAccess'
import { accessCookie, resolveAppSession } from '@/lib/playground/appSession'
import { createAppCheckoutSession, PricingAuthError, PricingUnavailableError } from '@/lib/playground/appPricing'
import { issueAccessCode, verifyAccessCode } from '@/lib/playground/appVerificationService'
import { ensureAppUser, findAppOwnerId, findPublishedApp, requestOrigin } from '@/lib/playground/publicApp'

export const runtime = 'nodejs'

/**
 * Getting into a published app.
 *
 * Two steps, and the split is the whole point. Step one takes an address and sends
 * it a code; it never grants anything. Step two takes the code back and grants.
 *
 * It used to be one step: type the address you bought with and you were in. That
 * made knowing a customer's email the same as being them — their paid app, and
 * their private thread with whoever made it. The convenience and the hole were the
 * same line of code, and nothing short of proving the address closes it.
 *
 * A buyer coming back from Stripe skips all of this: completing a payment against
 * an address is itself proof, and /grant marks them verified.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let body: { email?: string; name?: string; code?: string }
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

    // ── Step two: a code came back ──────────────────────────────────────────
    if (body.code) {
      const outcome = await verifyAccessCode(member, body.code)
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error, needsCode: true }, { status: 400 })
      }

      // A code entered here proves the inbox, so this session may read the
      // conversation and the billing attached to it.
      if (outcome.member.status === 'paid') {
        return grantResponse(app.id, outcome.member, 'verified')
      }

      // Proved who they are, but have not bought it. Straight to checkout — and the
      // row is already verified, so they come back from Stripe and stay in.
      return startCheckout(app, outcome.member.id, email, token)
    }

    // ── Step one: an address arrived ────────────────────────────────────────
    //
    // A free app has nothing to buy, so proving the address is only about reading
    // the private thread — and that is handled on the feedback route, which asks
    // for a code when it actually needs one. Sending one here would put a code in
    // front of an app that opens for everybody.
    if (!isPaywalled(app)) {
      return NextResponse.json({ granted: true, free: true })
    }

    // Someone who has never paid is sent to checkout rather than made to prove an
    // address first: payment proves it, and one step beats two.
    if (member.status !== 'paid') {
      return startCheckout(app, member.id, email, token)
    }

    // A paying customer coming back. This is the case that used to be a hole.
    const issued = await issueAccessCode(member, app.title)
    if (!issued.sent) {
      return NextResponse.json({ error: issued.error, needsCode: true }, { status: 429 })
    }
    return NextResponse.json({
      needsCode: true,
      message: 'You have already bought this. We sent a code to that address to check it is you.',
    })
  } catch (error) {
    if (error instanceof PricingUnavailableError || error instanceof PricingAuthError) {
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

async function startCheckout(
  app: { id: string; stripePriceId: string | null; priceInterval: 'one_time' | 'month' | 'year' | null },
  appUserId: string,
  email: string,
  token: string,
) {
  if (!isPaywalled(app as Parameters<typeof isPaywalled>[0])) {
    return NextResponse.json({ error: 'This app is not currently available to buy.' }, { status: 503 })
  }

  const origin = await requestOrigin()
  const url = await createAppCheckoutSession({
    appId: app.id,
    appUserId,
    priceId: app.stripePriceId!,
    interval: app.priceInterval || 'one_time',
    email,
    successUrl: `${origin}/api/play/${token}/grant?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/play/${token}?purchase=canceled`,
  })

  if (!url) return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 })
  return NextResponse.json({ checkoutUrl: url })
}

/**
 * The access cookie.
 *
 * A year, httpOnly, lax. Long-lived because the token is checked against the row on
 * every load — a refund, a cancelled subscription, or an unverified row all fail
 * there regardless of how much life the cookie has left.
 */
function grantResponse(
  appId: string,
  member: { id: string; sessionEpoch?: number | null },
  scope: AccessScope,
) {
  const res = NextResponse.json({ granted: true, scope })
  res.cookies.set(accessCookie(appId, signAccessToken(member.id, member.sessionEpoch ?? 0, scope)))
  return res
}

/**
 * Mark a return visit.
 *
 * Only the holder of the access cookie is counted — usage the publisher sees should
 * mean "this person opened it", not "somebody did".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const resolved = await resolveAppSession(req.cookies.get(accessCookieName(app.id))?.value, app.id)
    if (!resolved) return NextResponse.json({ ok: false })

    await db.update(appUsers)
      .set({ sessionCount: resolved.member.sessionCount + 1, lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(appUsers.id, resolved.member.id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
