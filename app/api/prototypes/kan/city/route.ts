import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { attentionPasses } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { cityFor } from '@/lib/kan/city/data'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Enough new context that Kan should sort it without being asked. */
const PILE = 6
/** And never more often than this: each look costs about 20 cents, so at most 40 cents a day. */
const EVERY_MS = 12 * 3600_000
const lastKick = new Map<string, number>()

/**
 * GET — your channels as a city, and what's happening in it right now.
 *
 * The city grows on its own: when new context has piled up at Town Hall and Kan
 * hasn't looked in a while, opening the city sends Kan to sort it. What it decides
 * comes back as construction sites on free lots, waiting for you to say "build it".
 * It only proposes; nothing changes until you do.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const city = await cityFor(userId)
  // Name any resident who doesn't have a name yet, after the response, so the city never waits on it.
  if (!('empty' in city) && city.plots.some((p) => !p.named)) {
    const { nameResidents } = await import('@/lib/kan/city/residents')
    afterResponse(() => nameResidents(userId).then(() => undefined))
  }
  if (!('empty' in city) && city.arrivals.count >= PILE && !city.townHall.passRunning && Date.now() - (lastKick.get(userId) ?? 0) > EVERY_MS) {
    lastKick.set(userId, Date.now())
    const recent = await db.query.attentionPasses.findFirst({
      where: and(eq(attentionPasses.ownerId, userId), gt(attentionPasses.startedAt, new Date(Date.now() - EVERY_MS))),
      columns: { id: true },
    })
    if (!recent) {
      const { runAttentionPass } = await import('@/lib/kan/attention/run')
      afterResponse(() => runAttentionPass(userId, { mode: 'rehearsal' }).then(() => undefined))
      return Response.json({ ...city, townHall: { ...city.townHall, passRunning: true } })
    }
  }
  return Response.json(city)
}
