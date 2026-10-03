import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appMessages, appUsers, playgroundApps, users } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { getChannelPermission } from '@/lib/api/permissions'
import { parseReplyToken, stripQuotedReply, tokenFromAddress } from '@/lib/email/replyRouting'
import { postFromPublisher, postFromUser } from '@/lib/playground/appThread'

export const runtime = 'nodejs'

/**
 * Replies to conversation emails, delivered by the inbound mail service (Postmark).
 *
 * The Reply-To on each conversation email carries a signed token naming the
 * conversation and the side replying. Postmark hands it back as MailboxHash. The
 * reply goes into that thread exactly as if it had been typed in Kanthink: the
 * other person is emailed, notified, and can reply again.
 *
 * Guarded three ways. The webhook needs the shared secret (Basic auth or ?key=).
 * The token is signed. And the sender must be the person that side belongs to:
 * the app user's own address, or someone who can edit the app's channel.
 *
 * Anything that doesn't qualify is acknowledged with 200 and dropped, so the mail
 * service doesn't retry it forever.
 */

type InboundPayload = {
  From?: string
  FromFull?: { Email?: string; Name?: string }
  To?: string
  ToFull?: Array<{ Email?: string; MailboxHash?: string }>
  CcFull?: Array<{ Email?: string; MailboxHash?: string }>
  OriginalRecipient?: string
  MailboxHash?: string
  Subject?: string
  TextBody?: string
  StrippedTextReply?: string
  Headers?: Array<{ Name?: string; Value?: string }>
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (!secret) return false
  const candidates: string[] = []
  const key = req.nextUrl.searchParams.get('key')
  if (key) candidates.push(key)
  const header = req.headers.get('authorization') || ''
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    candidates.push(decoded.slice(decoded.indexOf(':') + 1))
  }
  return candidates.some((c) => c.length === secret.length && timingSafeEqual(Buffer.from(c), Buffer.from(secret)))
}

const ok = (note: string) => NextResponse.json({ ok: true, note })

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let mail: InboundPayload
  try {
    mail = await req.json()
  } catch {
    return ok('not json')
  }

  // Out-of-office and other machine replies never go into a conversation.
  const auto = mail.Headers?.find((h) => h.Name?.toLowerCase() === 'auto-submitted')?.Value
  if (auto && auto.toLowerCase() !== 'no') return ok('auto-reply ignored')

  const token = mail.MailboxHash
    || [...(mail.ToFull ?? []), ...(mail.CcFull ?? [])].map((t) => t.MailboxHash || tokenFromAddress(t.Email)).find(Boolean)
    || tokenFromAddress(mail.OriginalRecipient)
    || tokenFromAddress(mail.To)
  const target = parseReplyToken(token)
  if (!target) return ok('no conversation token')

  const sender = (mail.FromFull?.Email || mail.From || '').replace(/^.*</, '').replace(/>.*$/, '').trim().toLowerCase()
  const text = (mail.StrippedTextReply?.trim() || stripQuotedReply(mail.TextBody || '')).replace(/\n-- \n[\s\S]*$/, '').trim()
  if (!text) return ok('empty reply')

  try {
    await ensureSchema()
    const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, target.appUserId) })
    if (!member) return ok('conversation gone')
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, member.appId) })
    if (!app) return ok('app gone')

    // The same words arriving twice (a retried delivery) go in once.
    const last = await db.query.appMessages.findFirst({
      where: and(eq(appMessages.appUserId, member.id), eq(appMessages.body, text.slice(0, 4000))),
      orderBy: [desc(appMessages.createdAt)],
    })
    if (last?.createdAt && Date.now() - last.createdAt.getTime() < 15 * 60 * 1000) return ok('duplicate')

    if (target.as === 'user') {
      if (sender !== member.email.toLowerCase()) {
        console.warn('[inbound-email] reply from an address that is not this person; dropped')
        return ok('sender mismatch')
      }
      await postFromUser({ app, member, body: text, via: 'email' })
      return ok('posted as user')
    }

    // The maker's side: the sender must be a Kanthink account that can edit the app's channel.
    const account = await db.query.users.findFirst({ where: eq(users.email, sender), columns: { id: true, email: true } })
    const permission = account ? await getChannelPermission(app.channelId, account.id, account.email) : null
    if (!account || !permission?.canEdit) {
      console.warn('[inbound-email] maker reply from an address without edit access; dropped')
      return ok('sender mismatch')
    }
    await postFromPublisher({ app, member, publisherUserId: account.id, body: text })
    return ok('posted as publisher')
  } catch (error) {
    console.error('[inbound-email] failed:', error)
    // A 500 makes the mail service retry, which is right for a transient failure.
    return NextResponse.json({ error: 'Could not record the reply' }, { status: 500 })
  }
}
