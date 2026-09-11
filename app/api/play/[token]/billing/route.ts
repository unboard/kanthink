import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { createPortalSession } from '@/lib/stripe'
import { accessCookieName, verifyAccessToken } from '@/lib/playground/appAccess'
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

    const key = req.nextUrl.searchParams.get('k') || req.cookies.get(accessCookieName(app.id))?.value
    const memberId = verifyAccessToken(key)
    if (!memberId) return NextResponse.redirect(home)

    const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
    if (!member || member.appId !== app.id || !member.stripeCustomerId) {
      return NextResponse.redirect(home)
    }

    const url = await createPortalSession(member.stripeCustomerId, home.toString())
    return NextResponse.redirect(url || home)
  } catch (error) {
    console.error('[play/billing] failed:', error)
    return NextResponse.redirect(home)
  }
}
