import { db } from '@/lib/db'
import { kanMessages, type KanMessageData } from '@/lib/db/schema'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'

/**
 * Kan's ongoing thread with its owner. There is one, kept on the server, so the phone
 * and the laptop show the same conversation, and Kan can speak first while they're away.
 */

export type KanMessage = typeof kanMessages.$inferSelect

export async function listThread(ownerId: string, limit = 60): Promise<KanMessage[]> {
  const rows = await db.query.kanMessages.findMany({
    where: eq(kanMessages.ownerId, ownerId),
    orderBy: [desc(kanMessages.createdAt)],
    limit,
  })
  return rows.reverse()
}

export async function addMessages(ownerId: string, msgs: { role: 'you' | 'kan'; kind?: 'chat' | 'reach' | 'plan' | 'work'; text: string; data?: KanMessageData; at?: Date }[]): Promise<KanMessage[]> {
  if (!msgs.length) return []
  const base = Date.now()
  return db.insert(kanMessages).values(msgs.map((m, i) => ({
    ownerId, role: m.role, kind: m.kind ?? 'chat', text: m.text.slice(0, 20_000), data: m.data ?? null,
    // A turn's two halves keep their order even when written in the same millisecond.
    createdAt: m.at ?? new Date(base + i),
  }))).returning()
}

/** Kan speaking first: a line in the thread the owner hasn't seen yet. */
export async function kanSays(ownerId: string, kind: 'reach' | 'plan' | 'work', text: string, data: KanMessageData): Promise<KanMessage> {
  const [m] = await addMessages(ownerId, [{ role: 'kan', kind, text, data }])
  return m
}

export async function markSeen(ownerId: string): Promise<void> {
  await db.update(kanMessages).set({ seenAt: new Date() })
    .where(and(eq(kanMessages.ownerId, ownerId), ne(kanMessages.kind, 'chat'), isNull(kanMessages.seenAt)))
}

/** For the city: when the thread last changed, and how many lines Kan sent first that they haven't seen. */
export async function threadStatus(ownerId: string): Promise<{ latestAt: number; unseen: number; last: string | null }> {
  const recent = await db.query.kanMessages.findMany({
    where: eq(kanMessages.ownerId, ownerId),
    orderBy: [desc(kanMessages.createdAt)],
    limit: 20,
    columns: { kind: true, text: true, seenAt: true, createdAt: true },
  })
  const unseen = recent.filter((m) => m.kind !== 'chat' && !m.seenAt)
  return {
    latestAt: +(recent[0]?.createdAt ?? 0),
    unseen: unseen.length,
    last: unseen[0]?.text.replace(/[#*_`>[\]]/g, '').split('\n').find((l) => l.trim())?.slice(0, 120) ?? null,
  }
}
