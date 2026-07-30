import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, users } from '@/lib/db/schema'
import { eq, or, asc, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { getUserChannels } from '@/lib/api/permissions'
import { getOrCreateQuickSaveChannel } from '@/lib/inbox/quickSaveChannel'

/**
 * GET /api/inbox/destinations
 *
 * Channels (with their columns) the user can save into, plus their remembered default.
 * Powers the destination picker on /save. Kept separate from GET /api/channels because
 * that route returns no columns and a lot the share sheet doesn't need — this runs on
 * the critical path of "I tapped share and want to file it in two seconds".
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    await ensureSchema()

    // Make sure Kan Bookmarks exists, so there's always at least one destination even
    // on a brand-new account sharing for the very first time.
    const quickSave = await getOrCreateQuickSaveChannel(userId)

    const roles = await getUserChannels(userId)
    const editableIds = roles
      .filter(r => r.role === 'owner' || r.role === 'editor')
      .map(r => r.channelId)
    if (!editableIds.includes(quickSave.channel.id)) editableIds.push(quickSave.channel.id)

    const channelList = await db.query.channels.findMany({
      where: or(...editableIds.map(id => eq(channels.id, id))),
    })

    const allColumns = await db.query.columns.findMany({
      where: inArray(columns.channelId, editableIds),
      orderBy: [asc(columns.position)],
    })

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })

    const destinations = channelList
      // Archived channels are still editable but nobody wants to file new reading into one.
      .filter(channel => channel.status !== 'archived')
      .map(channel => ({
        channelId: channel.id,
        channelName: channel.name,
        isQuickSave: channel.isQuickSave ?? false,
        columns: allColumns
          .filter(col => col.channelId === channel.id)
          .map(col => ({ id: col.id, name: col.name, isAiTarget: col.isAiTarget ?? false })),
      }))
      .filter(dest => dest.columns.length > 0)
      // Bookmarks first (it's the fallback), then alphabetical.
      .sort((a, b) => {
        if (a.isQuickSave !== b.isQuickSave) return a.isQuickSave ? -1 : 1
        return a.channelName.localeCompare(b.channelName)
      })

    // Only report a default that still resolves to a real, offered destination —
    // otherwise the picker would open on a channel/column the user can't see.
    const savedChannel = destinations.find(d => d.channelId === user?.saveDefaultChannelId)
    const savedColumn = savedChannel?.columns.find(c => c.id === user?.saveDefaultColumnId)

    const fallbackChannel = destinations.find(d => d.channelId === quickSave.channel.id) ?? destinations[0]
    const fallbackColumn = fallbackChannel?.columns.find(c => c.isAiTarget) ?? fallbackChannel?.columns[0]

    return NextResponse.json({
      destinations,
      default: savedChannel && savedColumn
        ? { channelId: savedChannel.channelId, columnId: savedColumn.id, isExplicit: true }
        : fallbackChannel && fallbackColumn
        ? { channelId: fallbackChannel.channelId, columnId: fallbackColumn.id, isExplicit: false }
        : null,
    })
  } catch (error) {
    console.error('Error loading save destinations:', error)
    return NextResponse.json({ error: 'Failed to load destinations' }, { status: 500 })
  }
}
