import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, cards, users } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { inColumnBucket } from '@/lib/db/cardBuckets'
import { newCardGoesFirst } from '@/lib/columnSort'
import { fetchUrlMetadata } from '@/lib/url-metadata'
import { getLLMClientForUser } from '@/lib/ai/llm'
import { runEventTriggers } from '@/lib/shrooms/runEventTriggers'
import { afterResponse } from '@/lib/afterResponse'
import { canEditChannel } from '@/lib/api/permissions'
import { getOrCreateQuickSaveChannel, BOOKMARK_INSTRUCTIONS } from '@/lib/inbox/quickSaveChannel'
import { nanoid } from 'nanoid'

/**
 * Resolve where a shared item should land.
 *
 * Precedence: an explicit destination from this request, then the user's saved
 * default, then the Kan Bookmarks inbox. Each candidate is permission-checked and
 * falls through on failure, so a deleted or unshared default degrades to the
 * bookmark channel instead of failing the save outright — losing the thing you just
 * shared is a much worse outcome than filing it in the wrong place.
 */
async function resolveDestination(
  userId: string,
  requestedChannelId?: string,
  requestedColumnId?: string
): Promise<{ channelId: string; column: typeof columns.$inferSelect }> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })

  const candidates: Array<{ channelId?: string; columnId?: string }> = [
    { channelId: requestedChannelId, columnId: requestedColumnId },
    { channelId: user?.saveDefaultChannelId ?? undefined, columnId: user?.saveDefaultColumnId ?? undefined },
  ]

  for (const candidate of candidates) {
    if (!candidate.channelId || !candidate.columnId) continue
    if (!(await canEditChannel(candidate.channelId, userId))) continue
    const column = await db.query.columns.findFirst({
      where: and(eq(columns.id, candidate.columnId), eq(columns.channelId, candidate.channelId)),
    })
    if (column) return { channelId: candidate.channelId, column }
  }

  const { channel, columns: channelColumns } = await getOrCreateQuickSaveChannel(userId)
  const inbox = channelColumns.find(c => c.isAiTarget) || channelColumns[0]
  return { channelId: channel.id, column: inbox as typeof columns.$inferSelect }
}

/**
 * POST /api/inbox
 * Save a URL, text, or both. Defaults to the user's Kan Bookmarks channel but accepts
 * an explicit channel/column destination and an optional freeform note.
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    await ensureSchema()

    const body = await req.json()
    const {
      url,
      text,
      title: providedTitle,
      note,
      channelId: requestedChannelId,
      columnId: requestedColumnId,
      rememberDestination,
    } = body

    if (!url && !text && !providedTitle) {
      return NextResponse.json(
        { error: 'At least one of url, text, or title is required' },
        { status: 400 }
      )
    }

    const { channelId: destChannelId, column: destColumn } = await resolveDestination(
      userId,
      typeof requestedChannelId === 'string' ? requestedChannelId : undefined,
      typeof requestedColumnId === 'string' ? requestedColumnId : undefined
    )

    // Remember the destination only once we know it resolved to something real, so a
    // stale id can never be written back as the new default.
    if (rememberDestination) {
      await db.update(users)
        .set({
          saveDefaultChannelId: destChannelId,
          saveDefaultColumnId: destColumn.id,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    }

    // Fetch URL metadata if URL provided
    let metadata: { title?: string; description?: string; ogImage?: string; siteName?: string } = {}
    if (url) {
      metadata = await fetchUrlMetadata(url)
    }

    // Determine card title
    let cardTitle = providedTitle || metadata.title
    if (!cardTitle && url) {
      try {
        cardTitle = new URL(url).hostname.replace(/^www\./, '')
      } catch {
        cardTitle = url
      }
    }
    if (!cardTitle) {
      cardTitle = text ? text.slice(0, 80) + (text.length > 80 ? '...' : '') : 'Kan Bookmarks'
    }

    // Build initial message content
    const messageParts: string[] = []
    if (url) {
      const linkLabel = metadata.siteName || metadata.title || url
      messageParts.push(`[${linkLabel}](${url})`)
    }
    if (metadata.description) {
      messageParts.push(metadata.description)
    }
    if (text && text !== url) {
      messageParts.push(text)
    }
    const initialMessage = messageParts.join('\n\n') || cardTitle

    // The user's own note goes in its own thread message rather than being merged into
    // the link blurb — it's the one part of the card they actually wrote, and it should
    // read that way in the thread and to any shroom summarising the card.
    const trimmedNote = typeof note === 'string' ? note.trim() : ''

    // Place the card according to the column's sort rule. This route writes the row
    // directly rather than going through POST /api/channels/:id/cards, which is why
    // shared bookmarks used to always land at the bottom no matter the column's order.
    let position: number
    if (newCardGoesFirst(destColumn.sortOrder ?? 'manual')) {
      // Take slot 0 and push the existing active cards down, mirroring how the main
      // card-create route handles an explicit requestedPosition.
      await db
        .update(cards)
        .set({ position: sql`${cards.position} + 1` })
        .where(inColumnBucket(destColumn.id, 'active'))
      position = 0
    } else {
      const existingCards = await db.query.cards.findMany({
        where: inColumnBucket(destColumn.id, 'active'),
        orderBy: [desc(cards.position)],
        limit: 1,
      })
      position = existingCards.length > 0 ? existingCards[0].position + 1 : 0
    }

    const cardId = nanoid()
    const now = new Date()
    const nowIso = now.toISOString()

    const messages = [
      {
        id: nanoid(),
        type: 'note' as const,
        content: initialMessage,
        createdAt: nowIso,
      },
      ...(trimmedNote
        ? [{
            id: nanoid(),
            type: 'note' as const,
            content: trimmedNote,
            authorId: userId,
            createdAt: nowIso,
          }]
        : []),
    ]

    await db.insert(cards).values({
      id: cardId,
      channelId: destChannelId,
      columnId: destColumn.id,
      title: cardTitle,
      messages,
      coverImageUrl: metadata.ogImage || null,
      source: 'manual',
      position,
      createdAt: now,
      updatedAt: now,
    })

    const createdCard = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })

    // Commentary first, then any shroom watching Inbox — sequentially, and after the
    // response so the share sheet closes immediately.
    //
    // This route writes the card row directly instead of going through
    // POST /api/channels/:id/cards, which is why shrooms never fired on a shared
    // bookmark: the trigger hook lives on that route. Saving from the share sheet has to
    // wake a shroom exactly like typing the card in does.
    //
    // Sequential, not parallel: both this and a modify shroom rewrite the card's whole
    // `messages` array, so running them concurrently means one silently overwrites the
    // other. Going in order also lets the shroom read the commentary as context.
    afterResponse(async () => {
      // Pass the user's note along — commentary on "why did I save this" is far more
      // useful when Kan can see what the user said they found interesting.
      await generateAICommentary(userId, destChannelId, cardId, cardTitle, initialMessage, url, trimmedNote).catch(() => {})
      await runEventTriggers({
        channelId: destChannelId,
        columnId: destColumn.id,
        eventType: 'card_created_in',
        cardId,
      })
    })

    return NextResponse.json({
      card: {
        ...createdCard,
        createdAt: createdCard?.createdAt?.toISOString(),
        updatedAt: createdCard?.updatedAt?.toISOString(),
      },
      channelId: destChannelId,
      columnId: destColumn.id,
    }, { status: 201 })
  } catch (error) {
    console.error('Error saving to inbox:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

/**
 * Generate AI commentary on the saved item and append as an ai_response message.
 */
async function generateAICommentary(
  userId: string,
  channelId: string,
  cardId: string,
  title: string,
  content: string,
  url?: string,
  userNote?: string
) {
  try {
    const { client } = await getLLMClientForUser(userId)
    if (!client) return

    // Now that a share can be filed into any channel, take that channel's own
    // instructions when it has them — commentary in a research channel shouldn't
    // read like generic bookmark blurb. Falls back to the bookmark analyst prompt.
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
    const systemPrompt = channel?.aiInstructions?.trim() || BOOKMARK_INSTRUCTIONS

    const noteBlock = userNote
      ? `\n\nThe user added this note about why they saved it — speak to it directly:\n"${userNote}"`
      : ''

    const prompt = url
      ? `The user saved this bookmark:\n\nTitle: ${title}\nURL: ${url}\n${content ? `\nContent: ${content}` : ''}${noteBlock}\n\nProvide brief, helpful commentary about this link (2-3 sentences).`
      : `The user saved this note:\n\nTitle: ${title}\n${content}${noteBlock}\n\nProvide brief, helpful commentary (2-3 sentences).`

    const response = await client.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ])

    if (!response.content) return

    // Append AI response as a new message
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    })
    if (!card) return

    const existingMessages = (card.messages || []) as Array<{ id: string; type: 'note' | 'question' | 'ai_response'; content: string; createdAt: string }>
    const updatedMessages: typeof existingMessages = [
      ...existingMessages,
      {
        id: nanoid(),
        type: 'ai_response',
        content: response.content,
        createdAt: new Date().toISOString(),
      },
    ]

    await db.update(cards)
      .set({ messages: updatedMessages, updatedAt: new Date() })
      .where(eq(cards.id, cardId))
  } catch (error) {
    console.error('AI commentary failed:', error)
  }
}
