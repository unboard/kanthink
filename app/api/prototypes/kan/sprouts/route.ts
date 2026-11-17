import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { bloomSprout, fieldFor, growSprouts, pullSprout, waterSprout } from '@/lib/kan/sprouts'
import { runBot } from '@/lib/kan/bots/run'

export const runtime = 'nodejs'
export const maxDuration = 300

/** GET — the Sprout Field: ideas growing out past town. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json({ field: await fieldFor(session.user.id) })
}

/**
 * POST { action, id?, text? }
 * - water: add a thought; it grows.
 * - pull: out like a weed (text = why, optional); Kan stops growing that kind of thing.
 * - bloom: off to the big city, born as a bot with a home, straight to work.
 * - walk: Kan walks the field now instead of waiting.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const { action, id, text } = (await req.json().catch(() => ({}))) as { action?: string; id?: string; text?: string }
  if (action === 'walk') return Response.json(await growSprouts(userId, { force: true }))
  if (!id) return Response.json({ error: 'Which sprout?' }, { status: 400 })
  if (action === 'water') {
    const r = await waterSprout(userId, id, text ?? '')
    return 'error' in r ? Response.json(r, { status: 400 }) : Response.json(r)
  }
  if (action === 'pull') {
    const r = await pullSprout(userId, id, text)
    return 'error' in r ? Response.json(r, { status: 400 }) : Response.json(r)
  }
  if (action === 'bloom') {
    const r = await bloomSprout(userId, id)
    if ('error' in r) return Response.json(r, { status: 400 })
    // Its first day in the city: to work right away, not at the next hourly round.
    afterResponse(async () => { await runBot(r.channelId, { trigger: 'manual' }).then(() => undefined).catch((err) => console.error('[sprouts] first run', err)) })
    return Response.json(r)
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 })
}
