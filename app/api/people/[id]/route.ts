import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { dropEmail, personDetail, sendDirect, sendEmail } from '@/lib/studio/people'
import { askKanAboutPerson } from '@/lib/studio/compose'

export const runtime = 'nodejs'
export const maxDuration = 120

interface RouteParams { params: Promise<{ id: string }> }

/**
 * One person: their conversation, and your private one with Kan about them.
 *
 * GET  — both.
 * POST — { action: 'kan', message }                — ask Kan (private; may come back with a draft)
 *        { action: 'send', emailId, subject?, body? } — send a draft, edits and all
 *        { action: 'drop', emailId }                  — don't send it
 *        { action: 'direct', subject, body }          — write and send your own
 *
 * Every write returns the refreshed detail, so the page never shows a stale thread.
 */

async function userId() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user.isAdmin ? session.user.id : null
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const uid = await userId()
  if (!uid) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const { id } = await params
  await ensureSchema()
  const detail = await personDetail(uid, id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const uid = await userId()
  if (!uid) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string; emailId?: string; subject?: string; body?: string; message?: string }
  await ensureSchema()

  try {
    if (body.action === 'kan') {
      const detail = await askKanAboutPerson(uid, id, body.message || '')
      return NextResponse.json(detail)
    }
    if (body.action === 'send' && body.emailId) {
      await sendEmail(uid, body.emailId, { subject: body.subject, body: body.body })
    } else if (body.action === 'drop' && body.emailId) {
      await dropEmail(uid, body.emailId)
    } else if (body.action === 'direct') {
      if (!body.body?.trim()) return NextResponse.json({ error: 'Write something first' }, { status: 400 })
      await sendDirect(uid, id, body.subject?.trim() || 'A note', body.body)
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const detail = await personDetail(uid, id)
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong'
    return NextResponse.json({ error: message, ...(await personDetail(uid, id).catch(() => ({}))) }, { status: 400 })
  }
}
