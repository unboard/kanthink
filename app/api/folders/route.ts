import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folders, userChannelOrg, channels } from '@/lib/db/schema'
import { eq, desc, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Virtual folder ID for global help channels
const HELP_FOLDER_ID = '__help__'

/**
 * GET /api/folders
 * List all folders for the current user
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  const userFolders = await db.query.folders.findMany({
    where: eq(folders.userId, userId),
    orderBy: [asc(folders.position)],
  })

  // Get channel organization for each folder
  const orgEntries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [asc(userChannelOrg.position)],
  })

  // Build folder structure with channel IDs
  const foldersWithChannels = userFolders.map(folder => {
    const channelIds = orgEntries
      .filter(entry => entry.folderId === folder.id)
      .map(entry => entry.channelId)

    return {
      ...folder,
      channelIds,
      createdAt: folder.createdAt?.toISOString(),
      updatedAt: folder.updatedAt?.toISOString(),
    }
  })

  // Get root-level channels (not in any folder)
  const rootChannelIds = orgEntries
    .filter(entry => !entry.folderId)
    .map(entry => entry.channelId)

  // Fetch global help channels for the Help folder
  const globalHelpChannels = await db.query.channels.findMany({
    where: eq(channels.isGlobalHelp, true),
    columns: { id: true, name: true },
    orderBy: [asc(channels.name)],
  })

  const globalChannelIds = globalHelpChannels.map(c => c.id)

  // Build response with Help folder first if there are global channels
  const helpFolder = globalChannelIds.length > 0 ? {
    id: HELP_FOLDER_ID,
    name: 'Help',
    channelIds: globalChannelIds,
    isCollapsed: false,
    isVirtual: true,
    isLocked: true,
    position: -1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } : null

  return NextResponse.json({
    folders: helpFolder ? [helpFolder, ...foldersWithChannels] : foldersWithChannels,
    rootChannelIds,
  })
}

/**
 * POST /api/folders
 * Create a new folder
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const body = await req.json()
    const { id: clientId, name, position: requestedPosition } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get max position
    const existingFolders = await db.query.folders.findMany({
      where: eq(folders.userId, userId),
      orderBy: [desc(folders.position)],
      limit: 1,
    })

    const maxPosition = existingFolders.length > 0 ? existingFolders[0].position : -1
    const position = requestedPosition ?? maxPosition + 1

    // Use client-provided ID if given (for optimistic sync), otherwise generate
    const folderId = clientId || nanoid()
    const now = new Date()

    await db.insert(folders).values({
      id: folderId,
      userId,
      name: name.trim(),
      isCollapsed: false,
      position,
      createdAt: now,
      updatedAt: now,
    })

    const createdFolder = await db.query.folders.findFirst({
      where: eq(folders.id, folderId),
    })

    return NextResponse.json(
      {
        folder: {
          ...createdFolder,
          channelIds: [],
          createdAt: createdFolder?.createdAt?.toISOString(),
          updatedAt: createdFolder?.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating folder:', error)
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }
}
