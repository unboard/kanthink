import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import type { KanMessageData } from '@/lib/db/schema'
import { addMessages, listThread, markSeen } from '@/lib/kan/thread/store'

export const runtime = 'nodejs'
export const maxDuration = 300

/** GET — Kan's thread, the latest 60 lines, oldest first. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json({ messages: await listThread(session.user.id) })
}

type Line = { role?: string; text?: string; data?: KanMessageData }

/**
 * POST { messages } — add a finished turn (their line and Kan's reply).
 * POST { action: 'seen' } — they opened the thread.
 * POST { action: 'reach' } — have Kan look over what's new now, and speak if there's something.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const body = await req.json().catch(() => ({})) as { action?: string; messages?: Line[] }
  if (body.action === 'seen') { await markSeen(userId); return Response.json({ ok: true }) }
  if (body.action === 'reach') {
    const { reachOut } = await import('@/lib/kan/thread/reach')
    return Response.json(await reachOut(userId, { force: true }))
  }
  const lines = (body.messages ?? []).slice(0, 4)
    .filter((m) => (m.role === 'you' || m.role === 'kan') && typeof m.text === 'string' && (m.text.trim() || m.data?.error))
    .map((m) => ({ role: m.role as 'you' | 'kan', text: String(m.text), data: m.data ? clean(m.data) : undefined }))
  if (!lines.length) return Response.json({ error: 'Nothing to add' }, { status: 400 })
  return Response.json({ messages: await addMessages(userId, lines) })
}

/** Only what a chat turn carries; a client never writes a reach-out's refs or a plan. */
function clean(d: KanMessageData): KanMessageData {
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined)
  return {
    about: s(d.about, 120),
    memo: s(d.memo, 4000),
    error: s(d.error, 300),
    steps: Array.isArray(d.steps) ? d.steps.slice(0, 40).map((x) => ({ label: s(x.label, 200) ?? '', write: Boolean(x.write), href: s(x.href, 300), error: Boolean(x.error) })) : undefined,
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.slice(0, 4).map((x) => ({ label: s(x.label, 80) ?? '', prompt: s(x.prompt, 1000) ?? '' })) : undefined,
  }
}
