import { db } from '@/lib/db'
import { channels, columns, cards, userChannelOrg } from '@/lib/db/schema'
import { eq, and, asc, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const BOOKMARK_COLUMNS = [
  // The Inbox is newest-first: you share something, you expect to find it at the top
  // next time you open the channel, not buried under everything you saved last month.
  { name: 'Inbox', isAiTarget: true, sortOrder: 'created_newest' as const },
  { name: 'Read Later', isAiTarget: false },
  { name: 'Interesting', isAiTarget: false },
  { name: 'Archive', isAiTarget: false },
]

export const BOOKMARK_INSTRUCTIONS = `You are a bookmark analyst. When a user saves a URL or text snippet, provide brief, helpful commentary:
- For articles/blog posts: summarize the key points and why it might be valuable
- For tools/products: explain what it does and who it's for
- For videos: describe the content and key takeaways if possible
- For general text: provide context or related ideas
Keep responses concise (2-3 sentences). Be genuinely helpful, not generic.`

const BOOKMARK_DESCRIPTION = `Your personal bookmark channel. Save anything from the web — links, articles, ideas, snippets — and Kan will organize and comment on them. Use the browser bookmarklet (desktop) or share sheet (mobile) to save from anywhere.`

/**
 * Find or create the user's Kan Bookmarks channel.
 *
 * Shared by POST /api/inbox and GET /api/inbox/destinations — the destination picker
 * has to be able to offer the bookmark channel even on a user's very first share,
 * before any card has been saved.
 */
export async function getOrCreateQuickSaveChannel(userId: string) {
  // Look for existing Kan Bookmarks channel
  const existing = await db.query.channels.findFirst({
    where: and(eq(channels.ownerId, userId), eq(channels.isQuickSave, true)),
  })

  if (existing) {
    let cols = await db.query.columns.findMany({
      where: eq(columns.channelId, existing.id),
      orderBy: [asc(columns.position)],
    })

    // One-time upgrade for channels created before columns had a sort preference:
    // give the bookmark Inbox the newest-first rule it should always have had. Only
    // touches NULL rows, so a user who deliberately picked manual keeps it.
    const inbox = cols.find(c => c.isAiTarget) || cols[0]
    if (inbox && inbox.sortOrder == null) {
      await db.update(columns)
        .set({ sortOrder: 'created_newest', updatedAt: new Date() })
        .where(eq(columns.id, inbox.id))
      cols = cols.map(c => (c.id === inbox.id ? { ...c, sortOrder: 'created_newest' as const } : c))
    }

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
    sortOrder: col.sortOrder ?? ('manual' as const),
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
