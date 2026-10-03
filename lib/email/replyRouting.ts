import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Reply-by-email for app conversations.
 *
 * Every email in a conversation between an app's maker and someone using it
 * carries a Reply-To that names the conversation and which side is replying:
 *
 *   <inbound mailbox>+<token>@<inbound domain>
 *
 * The inbound service (Postmark) posts each email it receives to
 * /api/webhooks/inbound-email with the part after the "+" as its MailboxHash,
 * and the reply lands in the right thread as if it had been typed in the app.
 *
 * The token is signed, so a guessed or edited address goes nowhere. It has to be
 * short: an email address's local part is capped at 64 characters, and Postmark's
 * mailbox id takes 32 of them. So it's 22 characters of id, one for the side, and
 * a 6-character signature.
 *
 * Until an inbound address is configured, conversation emails fall back to the
 * other person's real address, so replying still reaches a human, just outside
 * the thread.
 */

export type ReplySide = 'user' | 'publisher'

export type ReplyTarget = {
  /** The app user whose conversation this is. */
  appUserId: string
  /** Who is replying: the person using the app, or the app's maker. */
  as: ReplySide
}

function secret(): string {
  return process.env.INBOUND_EMAIL_SECRET || process.env.NEXTAUTH_SECRET || 'kanthink-dev'
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(`reply:${body}`).digest('base64url').slice(0, 6)
}

function uuidToCompact(id: string): string | null {
  const hex = id.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null
  return Buffer.from(hex, 'hex').toString('base64url')
}

function compactToUuid(compact: string): string | null {
  try {
    const hex = Buffer.from(compact, 'base64url').toString('hex')
    if (hex.length !== 32) return null
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return null
  }
}

export function replyToken(target: ReplyTarget): string | null {
  const compact = uuidToCompact(target.appUserId)
  if (!compact) return null
  const body = `${compact}${target.as === 'user' ? 'u' : 'p'}`
  return `${body}${sign(body)}`
}

export function parseReplyToken(token: string | null | undefined): ReplyTarget | null {
  if (!token || token.length !== 29) return null
  const body = token.slice(0, 23)
  const mac = token.slice(23)
  const expected = sign(body)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  const appUserId = compactToUuid(body.slice(0, 22))
  const side = body[22]
  if (!appUserId || (side !== 'u' && side !== 'p')) return null
  return { appUserId, as: side === 'u' ? 'user' : 'publisher' }
}

/** Is reply-by-email switched on? */
export function inboundConfigured(): boolean {
  return /^[^@\s+]+@[^@\s]+$/.test(process.env.INBOUND_EMAIL_ADDRESS || '')
}

/**
 * The Reply-To for one side of a conversation. The routed address when inbound is
 * configured, otherwise the other person's own address, so a reply still reaches
 * them.
 */
export function replyAddress(target: ReplyTarget, fallback?: string | null): string | null {
  const inbound = process.env.INBOUND_EMAIL_ADDRESS || ''
  const token = replyToken(target)
  if (inboundConfigured() && token) {
    const [local, domain] = inbound.split('@')
    return `${local}+${token}@${domain}`
  }
  return fallback || null
}

/** The token from a recipient address like mailbox+TOKEN@domain, if there is one. */
export function tokenFromAddress(address: string | null | undefined): string | null {
  const m = /^[^@+\s<]+\+([A-Za-z0-9_-]{29})@/.exec((address || '').trim().replace(/^.*</, ''))
  return m ? m[1] : null
}

/**
 * Just the new words of a reply: everything above the quoted message. Used when
 * the inbound service hasn't already stripped it.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (/^>/.test(line)) break
    if (/^On .+(wrote|écrit|schrieb):?\s*$/i.test(line)) break
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break
    if (/^_{5,}$/.test(line)) break
    if (/^From:\s.+/i.test(line) && out.length > 0) break
    if (/^Sent from my /i.test(line)) break
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
