import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers, playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { checkUnsubscribeSig } from '@/lib/studio/people'

export const runtime = 'nodejs'

/**
 * The link at the bottom of every People email. One click, no sign-in, no "are
 * you sure" — the law and good manners agree on that. Signed, so nobody can
 * unsubscribe someone else by guessing an id.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  let title = 'this app'
  let ok = false
  if (u && checkUnsubscribeSig(u, t)) {
    await ensureSchema()
    const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, u) })
    if (member) {
      if (!member.unsubscribedAt) {
        await db.update(appUsers).set({ unsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(appUsers.id, u))
      }
      const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, member.appId), columns: { title: true } })
      title = app?.title || title
      ok = true
    }
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:440px;margin:64px auto;background:#fff;border-radius:12px;padding:32px 28px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">${ok ? 'You’re unsubscribed' : 'That link didn’t work'}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">${ok ? `You won’t get any more emails about ${esc(title)}.` : 'It may be incomplete. Reply to the email you got and ask to be removed, and you will be.'}</p>
</div></body></html>`
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
