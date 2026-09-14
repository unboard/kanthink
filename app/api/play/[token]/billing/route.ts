import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { createPortalSession } from '@/lib/stripe'
import { accessCookieName, canReadPrivateData } from '@/lib/playground/appAccess'
import { resolveAppSession } from '@/lib/playground/appSession'
import { findPublishedApp } from '@/lib/playground/publicApp'

export const runtime = 'nodejs'

/**
 * "Manage my billing" for someone who bought an app.
 *
 * A redirect rather than a link, because a Stripe portal session is short-lived and
 * single-use — one baked into a receipt email would be dead within the hour. This
 * route mints a fresh one on every visit.
 *
 * Identity comes from the access cookie, or from the signed key in the receipt link
 * for a device that has never had one.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const home = new URL(`/play/${token}`, req.nextUrl.origin)

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.redirect(new URL('/', req.nextUrl.origin))

    // The link in a receipt email carries its own key; otherwise the cookie.
    const key = req.nextUrl.searchParams.get('k') || req.cookies.get(accessCookieName(app.id))?.value
    const resolved = await resolveAppSession(key, app.id)
    if (!resolved) return NextResponse.redirect(home)

    const member = resolved.member
    if (!member.stripeCustomerId) return NextResponse.redirect(home)

    // Cancelling a subscription and reading payment history are private to the
    // inbox, not to the card — a purchase-scope session does not get here.
    if (!canReadPrivateData(resolved.session)) return NextResponse.redirect(home)

    const url = await createPortalSession(member.stripeCustomerId, home.toString())
    return NextResponse.redirect(url || home)
  } catch (error) {
    console.error('[play/billing] failed:', error)
    return NextResponse.redirect(home)
  }
}
