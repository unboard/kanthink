import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, columns, userChannelOrg, channelShares } from '@/lib/db/schema'
import { eq, and, or, desc, asc } from 'drizzle-orm'
import { getUserChannelsWithSharerInfo, ChannelRole, SharedByInfo } from '@/lib/api/permissions'
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
  const userEmail = session.user.email

  // Get all channel IDs with roles and sharer info
  const userChannelRoles = await getUserChannelsWithSharerInfo(userId, userEmail)
  const channelIds = userChannelRoles.map(c => c.channelId)
  const roleMap = new Map(userChannelRoles.map(c => [c.channelId, c.role]))
  const sharedByMap = new Map(userChannelRoles.map(c => [c.channelId, c.sharedBy]))

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

  // Build response with roles, sharer info, and isGlobalHelp flag
  const channelsWithRoles = channelList.map(channel => ({
    ...channel,
    role: roleMap.get(channel.id) || 'viewer',
    sharedBy: sharedByMap.get(channel.id),
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

    console.log('[API/channels] Creating channel:', {
      clientId,
      name,
      description: description?.slice(0, 50),
      hasColumns: !!clientColumns,
      columnCount: clientColumns?.length,
      userId,
    })

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const channelId = clientId || nanoid()
    const now = new Date()

    // Create the channel
    console.log('[API/channels] Step 1: Inserting channel into database...')
    try {
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
      console.log('[API/channels] Step 1 complete: Channel inserted')
    } catch (insertError) {
      console.error('[API/channels] Step 1 FAILED - Channel insert error:', insertError)
      throw insertError
    }

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

    console.log('[API/channels] Step 2: Inserting columns...', { count: columnInserts.length })
    try {
      await db.insert(columns).values(columnInserts)
      console.log('[API/channels] Step 2 complete: Columns inserted')
    } catch (colError) {
      console.error('[API/channels] Step 2 FAILED - Columns insert error:', colError)
      throw colError
    }

    // Add to user's channel organization at the end of root level
    const existingOrg = await db.query.userChannelOrg.findMany({
      where: eq(userChannelOrg.userId, userId),
      orderBy: [desc(userChannelOrg.position)],
    })
    const maxPosition = existingOrg.length > 0 ? existingOrg[0].position : -1

    console.log('[API/channels] Step 3: Inserting userChannelOrg...')
    try {
      await db.insert(userChannelOrg).values({
        userId,
        channelId,
        position: maxPosition + 1,
      })
      console.log('[API/channels] Step 3 complete: UserChannelOrg inserted')
    } catch (orgError) {
      console.error('[API/channels] Step 3 FAILED - UserChannelOrg insert error:', orgError)
      throw orgError
    }

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', { message: errorMessage, stack: errorStack })
    // Always return error details for debugging
    return NextResponse.json({
      error: 'Failed to create channel',
      details: errorMessage,
      stack: errorStack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 })
  }
}
