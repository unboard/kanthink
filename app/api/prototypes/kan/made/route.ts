import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { keepMade, madeFor, makeSomething, setWeeklyBudget, tossMade } from '@/lib/kan/madeForYou'

export const runtime = 'nodejs'
export const maxDuration = 800

/** GET — Made for you: what Kan built on its own, and this week's budget. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json(await madeFor(session.user.id))
}

/**
 * POST { action, id?, text?, cents? }
 * - keep: it stays, and Kan makes more like it.
 * - toss: archived (text = why, optional); Kan makes nothing like it again.
 * - budget: the weekly budget in cents (0 turns it off).
 * - now: Kan looks and makes something now instead of waiting for tomorrow (budget still applies).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const { action, id, text, cents } = (await req.json().catch(() => ({}))) as { action?: string; id?: string; text?: string; cents?: number }
  if (action === 'budget' && typeof cents === 'number') return Response.json({ weeklyCents: await setWeeklyBudget(userId, cents) })
  if (action === 'now') {
    afterResponse(() => makeSomething(userId, { force: true }).then((r) => console.log('[made]', r.made ?? r.why)).catch((err) => console.error('[made]', err)))
    return Response.json({ started: true })
  }
  if (!id) return Response.json({ error: 'Which one?' }, { status: 400 })
  if (action === 'keep') { await keepMade(userId, id); return Response.json({ ok: true }) }
  if (action === 'toss') { await tossMade(userId, id, text); return Response.json({ ok: true }) }
  return Response.json({ error: 'Unknown action' }, { status: 400 })
}
