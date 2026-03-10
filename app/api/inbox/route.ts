import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, cards, userChannelOrg } from '@/lib/db/schema'
import { eq, and, asc, desc } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { fetchUrlMetadata } from '@/lib/url-metadata'
import { getLLMClientForUser } from '@/lib/ai/llm'
import { nanoid } from 'nanoid'

const QUICK_SAVE_COLUMNS = [
  { name: 'Inbox', isAiTarget: true },
  { name: 'Read Later', isAiTarget: false },
  { name: 'Interesting', isAiTarget: false },
  { name: 'Archive', isAiTarget: false },
]

const QUICK_SAVE_INSTRUCTIONS = `You are a bookmark analyst. When a user saves a URL or text snippet, provide brief, helpful commentary:
- For articles/blog posts: summarize the key points and why it might be valuable
- For tools/products: explain what it does and who it's for
- For videos: describe the content and key takeaways if possible
- For general text: provide context or related ideas
Keep responses concise (2-3 sentences). Be genuinely helpful, not generic.`

/**
 * Find or create the user's Quick Save channel.
 */
async function getOrCreateQuickSaveChannel(userId: string) {
  // Look for existing Quick Save channel
  const existing = await db.query.channels.findFirst({
    where: and(eq(channels.ownerId, userId), eq(channels.isQuickSave, true)),
  })

  if (existing) {
    const cols = await db.query.columns.findMany({
      where: eq(columns.channelId, existing.id),
      orderBy: [asc(columns.position)],
    })
    return { channel: existing, columns: cols }
  }

  // Auto-create
  const channelId = nanoid()
  const now = new Date()

  await db.insert(channels).values({
    id: channelId,
    ownerId: userId,
    name: 'Quick Save',
    description: 'Saved links, bookmarks, and snippets',
    aiInstructions: QUICK_SAVE_INSTRUCTIONS,
    status: 'active',
    isQuickSave: true,
    createdAt: now,
    updatedAt: now,
  })

  const columnInserts = QUICK_SAVE_COLUMNS.map((col, index) => ({
    id: nanoid(),
    channelId,
    name: col.name,
    position: index,
    isAiTarget: col.isAiTarget,
    createdAt: now,
    updatedAt: now,
  }))

  await db.insert(columns).values(columnInserts)

  // Add to user's channel organization
  const existingOrg = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  const maxPosition = existingOrg.length > 0 ? existingOrg[0].position : -1

  await db.insert(userChannelOrg).values({
    userId,
    channelId,
    position: maxPosition + 1,
  })

  const createdChannel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  })

  return { channel: createdChannel!, columns: columnInserts }
}

/**
 * POST /api/inbox
 * Save a URL, text, or both into the user's Quick Save channel.
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
    const { url, text, title: providedTitle } = body

    if (!url && !text && !providedTitle) {
      return NextResponse.json(
        { error: 'At least one of url, text, or title is required' },
        { status: 400 }
      )
    }

    // Get or create the Quick Save channel
    const { channel, columns: channelColumns } = await getOrCreateQuickSaveChannel(userId)
    const inboxColumn = channelColumns.find(c => c.isAiTarget) || channelColumns[0]

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
      cardTitle = text ? text.slice(0, 80) + (text.length > 80 ? '...' : '') : 'Quick Save'
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

    // Get max position in inbox column
    const existingCards = await db.query.cards.findMany({
      where: and(
        eq(cards.columnId, inboxColumn.id),
        eq(cards.isArchived, false)
      ),
      orderBy: [desc(cards.position)],
      limit: 1,
    })
    const position = existingCards.length > 0 ? existingCards[0].position + 1 : 0

    const cardId = nanoid()
    const now = new Date()
    const nowIso = now.toISOString()

    const messages = [{
      id: nanoid(),
      type: 'note' as const,
      content: initialMessage,
      createdAt: nowIso,
    }]

    await db.insert(cards).values({
      id: cardId,
      channelId: channel.id,
      columnId: inboxColumn.id,
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

    // Fire-and-forget: AI commentary
    generateAICommentary(userId, channel.id, cardId, cardTitle, initialMessage, url).catch(() => {})

    return NextResponse.json({
      card: {
        ...createdCard,
        createdAt: createdCard?.createdAt?.toISOString(),
        updatedAt: createdCard?.updatedAt?.toISOString(),
      },
      channelId: channel.id,
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
  url?: string
) {
  try {
    const { client } = await getLLMClientForUser(userId)
    if (!client) return

    const prompt = url
      ? `The user saved this bookmark:\n\nTitle: ${title}\nURL: ${url}\n${content ? `\nContent: ${content}` : ''}\n\nProvide brief, helpful commentary about this link (2-3 sentences).`
      : `The user saved this note:\n\nTitle: ${title}\n${content}\n\nProvide brief, helpful commentary (2-3 sentences).`

    const response = await client.complete([
      { role: 'system', content: QUICK_SAVE_INSTRUCTIONS },
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
