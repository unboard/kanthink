import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appEmails } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { eventUpdates, parseResendEvent, verifyResendSignature } from '@/lib/studio/emailEvents'

export const runtime = 'nodejs'

/**
 * Resend's webhook: delivered, opened, clicked and bounced, for the emails People
 * sends.
 *
 * Fails closed: without RESEND_WEBHOOK_SECRET nothing is accepted, because an
 * unsigned endpoint would let anyone mark an email as clicked. Events for emails
 * we didn't track (every other Kanthink email goes through the same account) are
 * acknowledged and ignored, so Resend doesn't retry them.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })

  const rawBody = await req.text()
  const valid = verifyResendSignature({
    secret,
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
    rawBody,
  })
  if (!valid) return NextResponse.json({ error: 'Bad signature' }, { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: true, ignored: 'not json' }) }

  const event = parseResendEvent(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: 'untracked event' })

  await ensureSchema()
  const email = await db.query.appEmails.findFirst({ where: eq(appEmails.deliveryId, event.deliveryId) })
  if (!email) return NextResponse.json({ ok: true, ignored: 'not a People email' })

  const updates = eventUpdates(email, event)
  if (Object.keys(updates).length) {
    await db.update(appEmails).set({ ...updates, updatedAt: new Date() }).where(eq(appEmails.id, email.id))
  }
  return NextResponse.json({ ok: true, recorded: Object.keys(updates) })
}
