import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cards, channels, columns } from '@/lib/db/schema'
import { inBucket } from '@/lib/db/cardBuckets'
import { parseStyleCard, type StyleRecord } from './library'

type Msg = { id?: string; type?: string; content?: string; imageUrls?: string[]; authorId?: string; authorName?: string; createdAt?: string }

/** A channel's prompt cards as styles, with its columns for moving them through testing. */
export async function loadStyles(channelId: string) {
  const [channel, cols, rows] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { id: true, name: true, description: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, channelId), orderBy: [asc(columns.position)], columns: { id: true, name: true } }),
    db.query.cards.findMany({
      where: and(eq(cards.channelId, channelId), inBucket('active')),
      orderBy: [asc(cards.position)],
      columns: { id: true, title: true, columnId: true, coverImageUrl: true, messages: true, updatedAt: true },
    }),
  ])
  if (!channel) return null
  const colName = new Map(cols.map((c) => [c.id, c.name]))
  const styles: (StyleRecord & { columnId: string })[] = []
  for (const r of rows) {
    const s = parseStyleCard({
      id: r.id, title: r.title, columnName: colName.get(r.columnId) ?? '', coverImageUrl: r.coverImageUrl,
      updatedAt: r.updatedAt ? r.updatedAt.getTime() : null, messages: (r.messages ?? []) as Msg[],
    })
    if (s) styles.push({ ...s, columnId: r.columnId })
  }
  return { channel, columns: cols, styles }
}

/**
 * A result worth keeping goes onto the style's own card: the image and the prompt
 * that drew it in its thread, and the card's cover when it has none yet, so the
 * library shows an example from then on.
 */
export async function saveResult(channelId: string, cardId: string, author: { id: string; name?: string | null }, r: { imageUrl: string; prompt: string; label: string }) {
  const card = await db.query.cards.findFirst({ where: and(eq(cards.id, cardId), eq(cards.channelId, channelId)), columns: { messages: true, coverImageUrl: true } })
  if (!card) return null
  const message: Msg = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 21),
    type: 'note',
    content: `**Tried in the style playground:** ${r.label}\n\n${r.prompt.split('\n').map((l) => `> ${l}`).join('\n')}`,
    imageUrls: [r.imageUrl],
    authorId: author.id,
    ...(author.name ? { authorName: author.name } : {}),
    createdAt: new Date().toISOString(),
  }
  await db.update(cards).set({
    messages: [...((card.messages ?? []) as Msg[]), message] as never,
    ...(card.coverImageUrl ? {} : { coverImageUrl: r.imageUrl }),
    updatedAt: new Date(),
  }).where(eq(cards.id, cardId))
  return message
}
