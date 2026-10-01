import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Customer.IO reporting webhooks: what happened to an email after it left.
 *
 * Customer.IO signs each request with the webhook's signing key over
 * `v0:<timestamp>:<raw body>`, HMAC-SHA256, hex, sent as X-CIO-Signature with the
 * timestamp in X-CIO-Timestamp. Anything that doesn't verify is ignored — an open
 * event is harmless on its own, but a forged "clicked" would mislead the crew.
 */

export function verifyCioSignature(opts: {
  signingKey: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  /** Seconds a request may be old before it's treated as a replay. */
  toleranceSeconds?: number
  now?: number
}): boolean {
  const { signingKey, timestamp, signature, rawBody } = opts
  if (!signingKey || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 60 * 60)) return false

  const expected = createHmac('sha256', signingKey).update(`v0:${timestamp}:${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The timestamp column a metric fills. Metrics we don't track map to null. */
export type EmailEventColumn = 'deliveredAt' | 'openedAt' | 'clickedAt' | 'bouncedAt'

const METRIC_COLUMN: Record<string, EmailEventColumn> = {
  delivered: 'deliveredAt',
  opened: 'openedAt',
  clicked: 'clickedAt',
  bounced: 'bouncedAt',
  dropped: 'bouncedAt',
  failed: 'bouncedAt',
  undeliverable: 'bouncedAt',
  spammed: 'bouncedAt',
}

export interface CioEmailEvent {
  deliveryId: string
  column: EmailEventColumn
  at: Date
  metric: string
}

/**
 * One reporting-webhook payload to the event it records, or null when it isn't an
 * email event we track. Customer.IO sends one event per request.
 */
export function parseCioEvent(payload: unknown): CioEmailEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { object_type?: string; metric?: string; timestamp?: number; data?: { delivery_id?: string } }
  if (p.object_type && p.object_type !== 'email') return null
  const metric = (p.metric || '').toLowerCase()
  const column = METRIC_COLUMN[metric]
  const deliveryId = p.data?.delivery_id
  if (!column || !deliveryId) return null
  const seconds = typeof p.timestamp === 'number' && Number.isFinite(p.timestamp) ? p.timestamp : Math.floor(Date.now() / 1000)
  return { deliveryId, column, at: new Date(seconds * 1000), metric }
}

/**
 * Whether an event should be written. Only the first of each kind counts — the
 * thread says "opened Tuesday", not "opened 9 times" — and a click implies an open,
 * so a click arriving first fills both.
 */
export function eventUpdates(
  current: Partial<Record<EmailEventColumn, Date | null>>,
  event: CioEmailEvent,
): Partial<Record<EmailEventColumn, Date>> {
  const updates: Partial<Record<EmailEventColumn, Date>> = {}
  if (!current[event.column]) updates[event.column] = event.at
  if (event.column === 'clickedAt' && !current.openedAt) updates.openedAt = event.at
  if ((event.column === 'openedAt' || event.column === 'clickedAt') && !current.deliveredAt) updates.deliveredAt = event.at
  return updates
}
