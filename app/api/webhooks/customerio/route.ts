import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appEmails } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { eventUpdates, parseCioEvent, verifyCioSignature } from '@/lib/studio/cio'

export const runtime = 'nodejs'

/**
 * Customer.IO's reporting webhook: delivered, opened, clicked and bounced, for the
 * emails People sends.
 *
 * Fails closed: without CUSTOMERIO_WEBHOOK_SIGNING_KEY nothing is accepted, because
 * an unsigned endpoint would let anyone mark an email as clicked. Events for emails
 * we didn't send (every other Kanthink email goes through the same workspace) are
 * acknowledged and ignored, so Customer.IO doesn't retry them.
 */
export async function POST(req: NextRequest) {
  const signingKey = process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY
  if (!signingKey) return NextResponse.json({ error: 'Webhook signing key not configured' }, { status: 503 })

  const rawBody = await req.text()
  const valid = verifyCioSignature({
    signingKey,
    timestamp: req.headers.get('x-cio-timestamp'),
    signature: req.headers.get('x-cio-signature'),
    rawBody,
  })
  if (!valid) return NextResponse.json({ error: 'Bad signature' }, { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: true, ignored: 'not json' }) }

  const event = parseCioEvent(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: 'untracked event' })

  await ensureSchema()
  const email = await db.query.appEmails.findFirst({ where: eq(appEmails.cioDeliveryId, event.deliveryId) })
  if (!email) return NextResponse.json({ ok: true, ignored: 'not a People email' })

  const updates = eventUpdates(email, event)
  if (Object.keys(updates).length) {
    await db.update(appEmails).set({ ...updates, updatedAt: new Date() }).where(eq(appEmails.id, email.id))
  }
  return NextResponse.json({ ok: true, recorded: Object.keys(updates) })
}
