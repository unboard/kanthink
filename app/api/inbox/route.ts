import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, cards, userChannelOrg } from '@/lib/db/schema'
import { eq, and, asc, desc } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { fetchUrlMetadata } from '@/lib/url-metadata'
import { getLLMClientForUser } from '@/lib/ai/llm'
import { nanoid } from 'nanoid'

const BOOKMARK_COLUMNS = [
  { name: 'Inbox', isAiTarget: true },
  { name: 'Read Later', isAiTarget: false },
  { name: 'Interesting', isAiTarget: false },
  { name: 'Archive', isAiTarget: false },
]

const BOOKMARK_INSTRUCTIONS = `You are a bookmark analyst. When a user saves a URL or text snippet, provide brief, helpful commentary:
- For articles/blog posts: summarize the key points and why it might be valuable
- For tools/products: explain what it does and who it's for
- For videos: describe the content and key takeaways if possible
- For general text: provide context or related ideas
Keep responses concise (2-3 sentences). Be genuinely helpful, not generic.`

const BOOKMARK_DESCRIPTION = `Your personal bookmark channel. Save anything from the web — links, articles, ideas, snippets — and Kan will organize and comment on them. Use the browser bookmarklet (desktop) or share sheet (mobile) to save from anywhere.`

/**
 * Find or create the user's Kan Bookmarks channel.
 */
async function getOrCreateQuickSaveChannel(userId: string) {
  // Look for existing Kan Bookmarks channel
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
    name: 'Kan Bookmarks',
    description: BOOKMARK_DESCRIPTION,
    aiInstructions: BOOKMARK_INSTRUCTIONS,
    status: 'active',
    isQuickSave: true,
    createdAt: now,
    updatedAt: now,
  })

  const columnInserts = BOOKMARK_COLUMNS.map((col, index) => ({
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

  // Add setup/education cards to the Inbox column
  const inboxCol = columnInserts.find(c => c.isAiTarget) || columnInserts[0]
  const setupCards = [
    {
      id: nanoid(),
      channelId,
      columnId: inboxCol.id,
      title: 'How to save from your phone',
      messages: [{
        id: nanoid(),
        type: 'note' as const,
        content: `**Android:** Open kanthink.com in Chrome, tap the menu (⋮) and select "Install app". After that, any app's Share button will show Kanthink as an option.\n\n**iPhone:** Open kanthink.com in Safari, tap the Share icon, then "Add to Home Screen". To save links, copy the URL and paste it into a new card here — or use the bookmarklet below on Safari.`,
        createdAt: now.toISOString(),
      }],
      source: 'manual' as const,
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      channelId,
      columnId: inboxCol.id,
      title: 'How to save from your computer',
      messages: [{
        id: nanoid(),
        type: 'note' as const,
        content: `**Browser bookmarklet:** Create a bookmark in your bookmarks bar, edit it, and replace the URL with this code:\n\n\`javascript:void(window.open('https://kanthink.com/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'kanthink-save','width=420,height=320'))\`\n\nName it "Save to Kanthink" — click it on any page to save the link here with AI commentary.\n\nYou can also find this code in the channel settings (gear icon).`,
        createdAt: now.toISOString(),
      }],
      source: 'manual' as const,
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]
  await db.insert(cards).values(setupCards)

  const createdChannel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  })

  return { channel: createdChannel!, columns: columnInserts }
}

/**
 * POST /api/inbox
 * Save a URL, text, or both into the user's Kan Bookmarks channel.
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

    // Get or create the Kan Bookmarks channel
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
      { role: 'system', content: BOOKMARK_INSTRUCTIONS },
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
