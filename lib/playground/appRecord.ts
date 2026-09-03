import { db } from '@/lib/db'
import { cards, playgroundApps } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { signAppToken } from '@/lib/playground/appToken'

/**
 * Creating and finding the app artifacts that hang off a card.
 *
 * Kept out of generateApp so the generator only ever *builds* — the automated
 * callers (a `build` shroom, a voice command) need to resolve which app they are
 * building into before they can call it, and they resolve it differently than a
 * person clicking "New app" does.
 */

export type PlaygroundAppRow = typeof playgroundApps.$inferSelect

/** Create an empty app on a card. No code, no model call — just a thread waiting for a brief. */
export async function createPlaygroundAppRecord(opts: {
  cardId: string
  userId?: string | null
  title?: string
}): Promise<PlaygroundAppRow | undefined> {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, opts.cardId) })
  if (!card) return undefined

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(playgroundApps)
    .where(eq(playgroundApps.cardId, card.id))

  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(playgroundApps).values({
    id,
    channelId: card.channelId,
    cardId: card.id,
    title: (opts.title || '').trim() || 'New app',
    // Minted up front so the iframe can authenticate even before the first build.
    appToken: signAppToken(id),
    position: Number(count) || 0,
    createdBy: opts.userId || null,
    createdAt: now,
    updatedAt: now,
  })

  return db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, id) })
}

/**
 * The app an automated build should target on a card: its most recent one, or a
 * new one if it has none.
 *
 * Automated builds reuse rather than accumulate. A `build` shroom firing nightly on
 * the same card is iterating on one app — spawning a fresh app per run would bury
 * the card in near-identical artifacts and throw away the design notes and thread
 * that make each successive build better than the last.
 */
export async function resolveAppForAutomatedBuild(opts: {
  cardId: string
  userId?: string | null
  title?: string
}): Promise<PlaygroundAppRow | undefined> {
  const existing = await db.query.playgroundApps.findMany({
    where: and(eq(playgroundApps.cardId, opts.cardId), eq(playgroundApps.isArchived, false)),
    orderBy: [desc(playgroundApps.updatedAt)],
    limit: 1,
  })
  if (existing[0]) return existing[0]
  return createPlaygroundAppRecord(opts)
}
