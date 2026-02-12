import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folders, userChannelOrg, channels, folderShares, users } from '@/lib/db/schema'
import { eq, and, desc, asc, inArray, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

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
  // Wrapped in try-catch in case the column doesn't exist yet in production
  let helpFolder = null
  try {
    const globalHelpChannels = await db.query.channels.findMany({
      where: eq(channels.isGlobalHelp, true),
      columns: { id: true, name: true },
      orderBy: [asc(channels.name)],
    })

    const globalChannelIds = globalHelpChannels.map(c => c.id)

    // Build response with Help folder first if there are global channels
    if (globalChannelIds.length > 0) {
      helpFolder = {
        id: HELP_FOLDER_ID,
        name: 'Help',
        channelIds: globalChannelIds,
        isCollapsed: false,
        isVirtual: true,
        isLocked: true,
        position: -1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  } catch (e) {
    // Column may not exist yet - ignore
    console.warn('Could not fetch global help channels:', e)
  }

  // Fetch folders shared with this user
  let sharedFolders: Array<Record<string, unknown>> = []
  try {
    const acceptedShares = await db.query.folderShares.findMany({
      where: and(
        eq(folderShares.userId, userId),
        isNotNull(folderShares.acceptedAt)
      ),
    })

    if (acceptedShares.length > 0) {
      const sharedFolderIds = acceptedShares.map(s => s.folderId)
      const sharedFolderData = await db.query.folders.findMany({
        where: inArray(folders.id, sharedFolderIds),
      })

      // Get sharer info for each shared folder
      const inviterIds = [...new Set(acceptedShares.map(s => s.invitedBy).filter((id): id is string => !!id))]
      const ownerIds = [...new Set(sharedFolderData.map(f => f.userId))]
      const allUserIds = [...new Set([...inviterIds, ...ownerIds])]

      let usersMap = new Map<string, { id: string; name: string | null; email: string; image: string | null }>()
      if (allUserIds.length > 0) {
        const usersList = await db.query.users.findMany({
          where: inArray(users.id, allUserIds),
          columns: { id: true, name: true, email: true, image: true },
        })
        for (const u of usersList) {
          usersMap.set(u.id, { id: u.id, name: u.name, email: u.email ?? '', image: u.image })
        }
      }

      for (const share of acceptedShares) {
        const folderData = sharedFolderData.find(f => f.id === share.folderId)
        if (!folderData) continue

        // Get channels in this folder (from the owner's perspective)
        const ownerOrgEntries = await db.query.userChannelOrg.findMany({
          where: and(
            eq(userChannelOrg.userId, folderData.userId),
            eq(userChannelOrg.folderId, folderData.id)
          ),
          orderBy: [asc(userChannelOrg.position)],
        })

        const channelIds = ownerOrgEntries.map(e => e.channelId)

        // Sharer: try invitedBy, fallback to folder owner
        let sharedBy = share.invitedBy ? usersMap.get(share.invitedBy) : undefined
        if (!sharedBy) {
          sharedBy = usersMap.get(folderData.userId)
        }

        sharedFolders.push({
          id: folderData.id,
          name: folderData.name,
          channelIds,
          isCollapsed: false,
          isReadOnly: true,
          sharedBy,
          position: folderData.position,
          createdAt: folderData.createdAt?.toISOString(),
          updatedAt: folderData.updatedAt?.toISOString(),
        })
      }
    }
  } catch (e) {
    console.warn('Could not fetch shared folders:', e)
  }

  return NextResponse.json({
    folders: helpFolder ? [helpFolder, ...foldersWithChannels] : foldersWithChannels,
    sharedFolders,
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
