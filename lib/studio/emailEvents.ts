import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Resend webhooks: what happened to an email after it left.
 *
 * Resend signs with Svix (the Standard Webhooks scheme): HMAC-SHA256 over
 * `<svix-id>.<svix-timestamp>.<raw body>`, keyed by the base64 part of the
 * `whsec_…` signing secret, sent base64 in svix-signature as space-separated
 * `v1,<sig>` entries. Anything that doesn't verify is ignored — an open event is
 * harmless on its own, but a forged "clicked" would mislead the crew.
 */

export function verifyResendSignature(opts: {
  secret: string
  id: string | null
  timestamp: string | null
  signature: string | null
  rawBody: string
  /** Seconds a request may be old before it's treated as a replay. */
  toleranceSeconds?: number
  now?: number
}): boolean {
  const { secret, id, timestamp, signature, rawBody } = opts
  if (!secret || !id || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 5 * 60)) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64'))
  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** The timestamp column an event fills. Events we don't track map to nothing. */
export type EmailEventColumn = 'deliveredAt' | 'openedAt' | 'clickedAt' | 'bouncedAt'

const EVENT_COLUMN: Record<string, EmailEventColumn> = {
  'email.delivered': 'deliveredAt',
  'email.opened': 'openedAt',
  'email.clicked': 'clickedAt',
  'email.bounced': 'bouncedAt',
  'email.failed': 'bouncedAt',
  'email.suppressed': 'bouncedAt',
  'email.complained': 'bouncedAt',
}

export interface EmailEvent {
  deliveryId: string
  column: EmailEventColumn
  at: Date
  type: string
}

/**
 * One webhook payload to the event it records, or null when it isn't an email
 * event we track. Resend sends one event per request.
 */
export function parseResendEvent(payload: unknown): EmailEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { type?: string; created_at?: string; data?: { email_id?: string } }
  const type = p.type || ''
  const column = EVENT_COLUMN[type]
  const deliveryId = p.data?.email_id
  if (!column || !deliveryId) return null
  const parsed = p.created_at ? new Date(p.created_at) : null
  const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()
  return { deliveryId, column, at, type }
}

/**
 * Whether an event should be written. Only the first of each kind counts — the
 * thread says "opened Tuesday", not "opened 9 times" — and a click implies an open,
 * so a click arriving first fills both.
 */
export function eventUpdates(
  current: Partial<Record<EmailEventColumn, Date | null>>,
  event: EmailEvent,
): Partial<Record<EmailEventColumn, Date>> {
  const updates: Partial<Record<EmailEventColumn, Date>> = {}
  if (!current[event.column]) updates[event.column] = event.at
  if (event.column === 'clickedAt' && !current.openedAt) updates.openedAt = event.at
  if ((event.column === 'openedAt' || event.column === 'clickedAt') && !current.deliveredAt) updates.deliveredAt = event.at
  return updates
}
