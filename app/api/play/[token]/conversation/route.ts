import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { canReadPrivateData } from '@/lib/playground/appAccess'
import { accessCookie, resolveAppSession } from '@/lib/playground/appSession'
import { findPublishedApp } from '@/lib/playground/publicApp'

export const runtime = 'nodejs'

/**
 * The link in a conversation email: sign this person in and open their
 * conversation with the app's maker.
 *
 * The key is a verified-scope session minted for the email's recipient. Following
 * a link only that inbox received proves the address, exactly as a code does, so
 * they land in the app with the Feedback conversation open and readable. No code
 * to type, no email thread to keep.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const open = new URL(`/play/${token}`, req.nextUrl.origin)
  open.searchParams.set('messages', '1')

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.redirect(new URL('/', req.nextUrl.origin))

    const key = req.nextUrl.searchParams.get('k')
    const resolved = key ? await resolveAppSession(key, app.id) : null
    const res = NextResponse.redirect(open)
    // Only an inbox-proving key becomes a cookie. Anything else still opens the
    // conversation; it just asks who they are first, as it would anyway.
    if (resolved && key && canReadPrivateData(resolved.session)) res.cookies.set(accessCookie(app.id, key))
    return res
  } catch (error) {
    console.error('[play/conversation] failed:', error)
    return NextResponse.redirect(open)
  }
}
