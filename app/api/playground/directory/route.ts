import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appMessages, appUsers, cards, channels, playgroundApps } from '@/lib/db/schema'
import { and, eq, inArray, desc } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { getUserChannels } from '@/lib/api/permissions'
import type { AppDirectoryEntry, ThumbnailStatus } from '@/lib/types'

export const runtime = 'nodejs'

/**
 * Every app you can reach, in one list.
 *
 * The board only ever knows about the apps on channels it has loaded, which is why
 * this is a route rather than a selector over the store: the point of the directory
 * is the apps you have forgotten about, and those live on channels you have not
 * opened in weeks.
 *
 * Counts are folded in here rather than fetched per tile — twenty tiles each asking
 * for their own audience count is twenty round trips to render one grid.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await ensureSchema()

    const reachable = await getUserChannels(session.user.id)
    const channelIds = reachable.map((c) => c.channelId)
    if (channelIds.length === 0) {
      return NextResponse.json({ apps: [] })
    }

    const rows = await db.query.playgroundApps.findMany({
      where: and(
        inArray(playgroundApps.channelId, channelIds),
        eq(playgroundApps.isArchived, false),
      ),
      orderBy: [desc(playgroundApps.updatedAt)],
    })

    if (rows.length === 0) {
      return NextResponse.json({ apps: [] })
    }

    const appIds = rows.map((a) => a.id)
    const cardIds = [...new Set(rows.map((a) => a.cardId))]
    const usedChannelIds = [...new Set(rows.map((a) => a.channelId))]

    const [cardRows, channelRows, audience, unread] = await Promise.all([
      db.query.cards.findMany({
        where: inArray(cards.id, cardIds),
        columns: { id: true, title: true },
      }),
      db.query.channels.findMany({
        where: inArray(channels.id, usedChannelIds),
        columns: { id: true, name: true },
      }),
      db.query.appUsers.findMany({
        where: inArray(appUsers.appId, appIds),
        columns: { appId: true, status: true },
      }),
      db.query.appMessages.findMany({
        where: and(
          inArray(appMessages.appId, appIds),
          eq(appMessages.sender, 'user'),
          eq(appMessages.isRead, false),
        ),
        columns: { appId: true },
      }),
    ])

    const cardTitles = new Map(cardRows.map((c) => [c.id, c.title]))
    const channelNames = new Map(channelRows.map((c) => [c.id, c.name]))

    const audienceCounts = new Map<string, { total: number; paid: number }>()
    for (const member of audience) {
      const entry = audienceCounts.get(member.appId) ?? { total: 0, paid: 0 }
      entry.total += 1
      if (member.status === 'paid') entry.paid += 1
      audienceCounts.set(member.appId, entry)
    }

    const unreadCounts = new Map<string, number>()
    for (const message of unread) {
      unreadCounts.set(message.appId, (unreadCounts.get(message.appId) ?? 0) + 1)
    }

    const apps: AppDirectoryEntry[] = rows.map((app) => {
      const counts = audienceCounts.get(app.id) ?? { total: 0, paid: 0 }
      return {
        id: app.id,
        title: app.title,
        summary: app.summary,
        tagline: app.tagline,
        channelId: app.channelId,
        channelName: channelNames.get(app.channelId) ?? 'Unknown channel',
        cardId: app.cardId,
        // A card deleted out from under its apps takes them with it, so a missing
        // title here means the read raced a delete rather than that the data is bad.
        cardTitle: cardTitles.get(app.cardId) ?? 'Removed card',
        generationCount: app.generationCount,
        isPublic: !!app.isPublic,
        shareToken: app.shareToken,
        thumbnailUrl: app.thumbnailUrl,
        thumbnailStatus: (app.thumbnailStatus ?? 'none') as ThumbnailStatus,
        listedInDirectory: app.listedInDirectory !== false,
        viewCount: app.viewCount ?? 0,
        paywallEnabled: !!app.paywallEnabled,
        priceAmount: app.priceAmount,
        priceCurrency: app.priceCurrency,
        priceInterval: app.priceInterval,
        audienceCount: counts.total,
        paidCount: counts.paid,
        unreadCount: unreadCounts.get(app.id) ?? 0,
        createdAt: (app.createdAt ?? new Date()).toISOString(),
        updatedAt: (app.updatedAt ?? new Date()).toISOString(),
      }
    })

    return NextResponse.json({ apps })
  } catch (error) {
    console.error('[playground/directory] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load apps' }, { status: 500 })
  }
}
