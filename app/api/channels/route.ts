import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, userChannelOrg, channelShares } from '@/lib/db/schema'
import { eq, and, or, desc, asc } from 'drizzle-orm'
import { getUserChannels, ChannelRole } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'

const DEFAULT_COLUMN_NAMES = ['Inbox', 'Interesting', 'Useful', 'Archive']

/**
 * GET /api/channels
 * List all channels accessible to the current user (owned + shared)
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  // Get all channel IDs with roles
  const userChannelRoles = await getUserChannels(userId)
  const channelIds = userChannelRoles.map(c => c.channelId)
  const roleMap = new Map(userChannelRoles.map(c => [c.channelId, c.role]))

  if (channelIds.length === 0) {
    return NextResponse.json({ channels: [], organization: { folders: [], channelOrder: [] } })
  }

  // Fetch channel data
  const channelList = await db.query.channels.findMany({
    where: or(...channelIds.map(id => eq(channels.id, id))),
  })

  // Fetch user's organization preferences
  const orgEntries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [asc(userChannelOrg.position)],
  })

  // Build response with roles attached and isGlobalHelp flag
  const channelsWithRoles = channelList.map(channel => ({
    ...channel,
    role: roleMap.get(channel.id) || 'viewer',
    isGlobalHelp: channel.isGlobalHelp ?? false,
    createdAt: channel.createdAt?.toISOString(),
    updatedAt: channel.updatedAt?.toISOString(),
  }))

  return NextResponse.json({
    channels: channelsWithRoles,
    organization: orgEntries.map(entry => ({
      channelId: entry.channelId,
      folderId: entry.folderId,
      position: entry.position,
    })),
  })
}

/**
 * POST /api/channels
 * Create a new channel
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const body = await req.json()
    const { id: clientId, name, description, aiInstructions, columnNames, columns: clientColumns } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const channelId = clientId || nanoid()
    const now = new Date()

    // Create the channel
    await db.insert(channels).values({
      id: channelId,
      ownerId: userId,
      name: name.trim(),
      description: description || '',
      aiInstructions: aiInstructions || '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    // Create columns - use client-provided columns with IDs if available
    let columnInserts: Array<{
      id: string
      channelId: string
      name: string
      position: number
      isAiTarget: boolean
      createdAt: Date
      updatedAt: Date
    }>

    if (clientColumns && Array.isArray(clientColumns) && clientColumns.length > 0) {
      // Use client-provided column IDs for optimistic sync consistency
      columnInserts = clientColumns.map((col: { id: string; name: string; isAiTarget?: boolean }, index: number) => ({
        id: col.id,
        channelId,
        name: col.name,
        position: index,
        isAiTarget: col.isAiTarget ?? index === 0,
        createdAt: now,
        updatedAt: now,
      }))
    } else {
      // Fallback to column names or defaults
      const colNames = columnNames && Array.isArray(columnNames) && columnNames.length > 0
        ? columnNames
        : DEFAULT_COLUMN_NAMES

      columnInserts = colNames.map((colName: string, index: number) => ({
        id: nanoid(),
        channelId,
        name: colName,
        position: index,
        isAiTarget: index === 0,
        createdAt: now,
        updatedAt: now,
      }))
    }

    await db.insert(columns).values(columnInserts)

    // Add to user's channel organization at the end of root level
    const existingOrg = await db.query.userChannelOrg.findMany({
      where: eq(userChannelOrg.userId, userId),
      orderBy: [desc(userChannelOrg.position)],
    })
    const maxPosition = existingOrg.length > 0 ? existingOrg[0].position : -1

    await db.insert(userChannelOrg).values({
      userId,
      channelId,
      position: maxPosition + 1,
    })

    // Fetch the created channel with columns
    const createdChannel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
    })

    const createdColumns = await db.query.columns.findMany({
      where: eq(columns.channelId, channelId),
      orderBy: [asc(columns.position)],
    })

    return NextResponse.json({
      channel: {
        ...createdChannel,
        role: 'owner' as ChannelRole,
        createdAt: createdChannel?.createdAt?.toISOString(),
        updatedAt: createdChannel?.updatedAt?.toISOString(),
      },
      columns: createdColumns.map(col => ({
        ...col,
        createdAt: col.createdAt?.toISOString(),
        updatedAt: col.updatedAt?.toISOString(),
      })),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating channel:', error)
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
}
