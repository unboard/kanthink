import { db } from '@/lib/db'
import { cards, channels, claudeSessions } from '@/lib/db/schema'
import { and, desc, eq, isNull, max } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Claude Code, as the city sees it. It isn't a bot that lives here: it runs in a
 * terminal on the owner's computer, and its hooks (scripts/claude-presence.mjs) say
 * when a session is open and whether it's working. Notes left for it become cards in
 * Work → Do these, which an open session hears about on its next turn and a closed
 * one finds the next time it's asked to look.
 */

const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
/** A session that hasn't been heard from in this long most likely closed without saying so. */
const STALE_MS = 12 * 3600_000

export interface ClaudePresence {
  state: 'working' | 'idle' | 'offline'
  /** When it last did anything, open or not. */
  lastSeenAt: number | null
  sessions: number
  /** Whether the hooks have ever reported in, i.e. presence is set up on this computer. */
  wired: boolean
  /** Cards waiting in Do these. */
  waiting: number
}

export async function claudePresence(ownerId: string): Promise<ClaudePresence> {
  const [open, last, waiting] = await Promise.all([
    db.query.claudeSessions.findMany({ where: and(eq(claudeSessions.ownerId, ownerId), isNull(claudeSessions.endedAt)), orderBy: [desc(claudeSessions.lastSeenAt)], limit: 10 }),
    db.select({ at: max(claudeSessions.lastSeenAt) }).from(claudeSessions).where(eq(claudeSessions.ownerId, ownerId)),
    db.query.cards.findMany({ where: and(eq(cards.channelId, WORK_CHANNEL_ID), eq(cards.columnId, DO_THESE_COLUMN_ID), eq(cards.isArchived, false)), columns: { id: true } }),
  ])
  const live = open.filter((s) => s.lastSeenAt && Date.now() - +s.lastSeenAt < STALE_MS)
  const lastSeenAt = last[0]?.at ? +last[0].at : null
  return {
    state: live.some((s) => s.state === 'working') ? 'working' : live.length ? 'idle' : 'offline',
    lastSeenAt,
    sessions: live.length,
    wired: lastSeenAt !== null,
    waiting: waiting.length,
  }
}

/** Leave Claude Code a note: a card at the top of Work → Do these, in the owner's words. */
export async function noteForClaude(owner: { id: string; name?: string | null; image?: string | null }, text: string): Promise<{ cardId: string } | { error: string }> {
  const work = await db.query.channels.findFirst({ where: eq(channels.id, WORK_CHANNEL_ID), columns: { ownerId: true } })
  if (!work || work.ownerId !== owner.id) return { error: 'Claude Code’s Work channel isn’t yours.' }
  const body = text.trim().slice(0, 4000)
  if (!body) return { error: 'Say what you need.' }
  const firstLine = body.split('\n')[0].replace(/\s+/g, ' ').trim()
  const title = firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
  const top = await db.query.cards.findFirst({
    where: and(eq(cards.columnId, DO_THESE_COLUMN_ID), eq(cards.isArchived, false)),
    orderBy: [cards.position],
    columns: { position: true },
  })
  const id = nanoid()
  const now = new Date()
  await db.insert(cards).values({
    id, channelId: WORK_CHANNEL_ID, columnId: DO_THESE_COLUMN_ID, title, position: (top?.position ?? 0) - 1, source: 'manual',
    messages: [{
      id: nanoid(), type: 'note', content: `${body}\n\n_Left for Claude Code from Kan City._`,
      authorId: owner.id, authorName: owner.name ?? 'You', authorImage: owner.image ?? undefined, createdAt: now.toISOString(),
    }] as never,
    createdAt: now, updatedAt: now,
  })
  return { cardId: id }
}
