import { db } from '@/lib/db'
import { cards, channels, columns, playgroundApps, tasks, users } from '@/lib/db/schema'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { inBucket } from '@/lib/db/cardBuckets'

/**
 * A channel's board, lean enough to draw in a sheet over Kan City.
 *
 * Only what a glance needs: titles, a line of each card, thread and task counts.
 * The full card (thread, tasks, apps) is a second, per-card read.
 */

const PER_COLUMN = 60

type Message = { id: string; type: string; content: string; authorId?: string; authorName?: string; createdAt: string }

/** Markdown and whitespace flattened to one readable line. */
function plain(text: string | null | undefined, max = 140): string {
  const t = (text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export async function channelBoard(channelId: string, canEdit: boolean) {
  const [channel, cols, rows, taskCounts, apps] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { id: true, name: true, description: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true, name: true } }),
    db.query.cards.findMany({
      where: and(eq(cards.channelId, channelId), inBucket('active')),
      orderBy: [asc(cards.position)],
      columns: { id: true, columnId: true, title: true, summary: true, messages: true, tags: true, source: true, updatedAt: true },
    }),
    db.select({
      cardId: tasks.cardId,
      n: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`,
    })
      .from(tasks)
      .where(and(eq(tasks.channelId, channelId), sql`COALESCE(${tasks.isArchived}, 0) = 0`))
      .groupBy(tasks.cardId),
    db.select({ cardId: playgroundApps.cardId }).from(playgroundApps).where(eq(playgroundApps.channelId, channelId)),
  ])
  if (!channel) return null

  const taskOf = new Map(taskCounts.filter((t) => t.cardId).map((t) => [t.cardId as string, { n: Number(t.n), done: Number(t.done ?? 0) }]))
  const withApp = new Set(apps.map((a) => a.cardId))
  const byColumn = new Map<string, typeof rows>()
  for (const r of rows) byColumn.set(r.columnId, [...(byColumn.get(r.columnId) ?? []), r])

  return {
    channel: { ...channel, canEdit },
    columns: cols.map((c) => {
      const list = byColumn.get(c.id) ?? []
      return {
        id: c.id,
        name: c.name,
        total: list.length,
        cards: list.slice(0, PER_COLUMN).map((r) => {
          const msgs = (r.messages ?? []) as Message[]
          const t = taskOf.get(r.id)
          return {
            id: r.id,
            title: r.title,
            snippet: plain(r.summary || msgs[0]?.content),
            messageCount: msgs.length,
            taskCount: t?.n ?? 0,
            tasksDone: t?.done ?? 0,
            hasApp: withApp.has(r.id),
            tags: r.tags ?? [],
            source: r.source ?? 'manual',
            updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
          }
        }),
      }
    }),
  }
}

export type ChannelBoard = NonNullable<Awaited<ReturnType<typeof channelBoard>>>

export async function cardDetail(channelId: string, cardId: string) {
  const card = await db.query.cards.findFirst({
    where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)),
    columns: { id: true, title: true, summary: true, messages: true, columnId: true, tags: true, updatedAt: true },
  })
  if (!card) return null
  const msgs = ((card.messages ?? []) as Message[]).slice(-20)
  const authorIds = [...new Set(msgs.map((m) => m.authorId).filter((x): x is string => Boolean(x)))]
  const [taskRows, appRows, people] = await Promise.all([
    db.query.tasks.findMany({
      where: and(eq(tasks.cardId, cardId), sql`COALESCE(${tasks.isArchived}, 0) = 0`),
      orderBy: [asc(tasks.position)],
      columns: { id: true, title: true, status: true },
    }),
    db.query.playgroundApps.findMany({
      where: eq(playgroundApps.cardId, cardId),
      columns: { id: true, title: true, isPublic: true, shareToken: true },
    }),
    authorIds.length ? db.query.users.findMany({ where: inArray(users.id, authorIds), columns: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  return {
    id: card.id,
    title: card.title,
    columnId: card.columnId,
    summary: card.summary ?? null,
    tags: card.tags ?? [],
    updatedAt: card.updatedAt ? card.updatedAt.getTime() : null,
    totalMessages: (card.messages ?? []).length,
    messages: msgs.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      author: m.type === 'ai_response' ? 'Kan' : m.authorName || (m.authorId ? nameOf.get(m.authorId) : null) || 'You',
      createdAt: m.createdAt,
    })),
    tasks: taskRows.map((t) => ({ id: t.id, title: t.title, done: t.status === 'done' })),
    apps: appRows.map((a) => ({ id: a.id, title: a.title, url: a.isPublic && a.shareToken ? `/play/${a.shareToken}` : null })),
  }
}

export type CardDetail = NonNullable<Awaited<ReturnType<typeof cardDetail>>>

/** Append a note to a card's thread, the same message shape the board writes. */
export async function addNote(channelId: string, cardId: string, author: { id: string; name?: string | null }, content: string) {
  const card = await db.query.cards.findFirst({ where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)), columns: { messages: true } })
  if (!card) return null
  const message = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 21),
    type: 'note' as const,
    content,
    authorId: author.id,
    ...(author.name ? { authorName: author.name } : {}),
    createdAt: new Date().toISOString(),
  }
  await db.update(cards).set({ messages: [...(card.messages ?? []), message], updatedAt: new Date() }).where(eq(cards.id, cardId))
  return message
}
