import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folderShares, channelShares, folders, users, userChannelOrg, channels } from '@/lib/db/schema'
import { eq, and, or, desc, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createNotification } from '@/lib/notifications/createNotification'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/folders/:id/shares
 * List all shares for a folder
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId } = await params
  const userId = session.user.id

  try {
    // Verify folder ownership
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Get all shares for this folder
    const shares = await db.query.folderShares.findMany({
      where: eq(folderShares.folderId, folderId),
    })

    // Get user info for accepted shares
    const userIds = shares.filter(s => s.userId).map(s => s.userId!)
    const shareUsers = userIds.length > 0
      ? await db.query.users.findMany({
          where: or(...userIds.map(id => eq(users.id, id))),
          columns: { id: true, name: true, email: true, image: true },
        })
      : []

    const userMap = new Map(shareUsers.map(u => [u.id, u]))

    // Get owner info
    const owner = await db.query.users.findFirst({
      where: eq(users.id, folder.userId),
      columns: { id: true, name: true, email: true, image: true },
    })

    return NextResponse.json({
      canManage: true,
      owner: owner ? { ...owner, role: 'owner' } : null,
      shares: shares.map(share => ({
        id: share.id,
        folderId: share.folderId,
        userId: share.userId,
        email: share.email,
        role: share.role,
        user: share.userId ? userMap.get(share.userId) : null,
        invitedBy: share.invitedBy,
        invitedAt: share.invitedAt?.toISOString(),
        acceptedAt: share.acceptedAt?.toISOString(),
        isPending: !share.acceptedAt,
      })),
    })
  } catch (error) {
    console.error('Error fetching folder shares:', error)
    return NextResponse.json({ error: 'Failed to fetch folder shares' }, { status: 500 })
  }
}

/**
 * POST /api/folders/:id/shares
 * Create a new folder share (invite by email)
 * This also creates channelShares for all channels in the folder
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId } = await params
  const userId = session.user.id

  try {
    // Verify folder ownership
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or not owned by you' }, { status: 404 })
    }

    const body = await req.json()
    const { email, role = 'viewer' } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (!['editor', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "viewer"' },
        { status: 400 }
      )
    }

    // Check if already shared with this email
    const existingShare = await db.query.folderShares.findFirst({
      where: and(
        eq(folderShares.folderId, folderId),
        eq(folderShares.email, normalizedEmail)
      ),
    })

    if (existingShare) {
      return NextResponse.json(
        { error: 'Folder already shared with this email' },
        { status: 409 }
      )
    }

    // Don't allow sharing with yourself
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    })
    if (currentUser?.email?.toLowerCase() === normalizedEmail) {
      return NextResponse.json(
        { error: 'Cannot share with yourself' },
        { status: 400 }
      )
    }

    // Check if user with this email exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      columns: { id: true },
    })

    const folderShareId = nanoid()
    const now = new Date()

    // Create folder share
    await db.insert(folderShares).values({
      id: folderShareId,
      folderId,
      userId: existingUser?.id || null,
      email: normalizedEmail,
      role,
      invitedBy: userId,
      invitedAt: now,
      acceptedAt: existingUser ? now : null,
    })

    // Get all channels in this folder
    const orgEntries = await db.query.userChannelOrg.findMany({
      where: and(
        eq(userChannelOrg.userId, userId),
        eq(userChannelOrg.folderId, folderId)
      ),
    })

    const channelIds = orgEntries.map(e => e.channelId)

    // Create channel shares for each channel in the folder
    for (const channelId of channelIds) {
      // Check if this user already has a direct share on this channel
      const existingChannelShare = existingUser
        ? await db.query.channelShares.findFirst({
            where: and(
              eq(channelShares.channelId, channelId),
              eq(channelShares.userId, existingUser.id)
            ),
          })
        : null

      // Skip if already has access
      if (existingChannelShare) continue

      // Also check by email for pending invites
      const existingEmailShare = await db.query.channelShares.findFirst({
        where: and(
          eq(channelShares.channelId, channelId),
          eq(channelShares.email, normalizedEmail)
        ),
      })

      if (existingEmailShare) continue

      await db.insert(channelShares).values({
        id: nanoid(),
        channelId,
        userId: existingUser?.id || null,
        email: normalizedEmail,
        role,
        folderShareId,
        invitedBy: userId,
        invitedAt: now,
        acceptedAt: existingUser ? now : null,
      })

      // If user exists, create userChannelOrg entry
      if (existingUser) {
        const maxPos = await getMaxOrgPosition(existingUser.id)
        try {
          await db.insert(userChannelOrg).values({
            userId: existingUser.id,
            channelId,
            position: maxPos + 1,
          })
        } catch {
          // Ignore duplicate entry errors (unique constraint on userId + channelId)
        }
      }
    }

    // Send notification
    if (existingUser) {
      createNotification({
        userId: existingUser.id,
        type: 'folder_shared',
        title: 'Folder shared with you',
        body: `You've been invited to folder "${folder.name}" with ${channelIds.length} channel${channelIds.length !== 1 ? 's' : ''}`,
        data: { folderId },
      }).catch(() => {})
    }

    const createdShare = await db.query.folderShares.findFirst({
      where: eq(folderShares.id, folderShareId),
    })

    return NextResponse.json(
      {
        share: {
          id: createdShare?.id,
          folderId: createdShare?.folderId,
          userId: createdShare?.userId,
          email: createdShare?.email,
          role: createdShare?.role,
          invitedBy: createdShare?.invitedBy,
          invitedAt: createdShare?.invitedAt?.toISOString(),
          acceptedAt: createdShare?.acceptedAt?.toISOString(),
          isPending: !createdShare?.acceptedAt,
          user: existingUser
            ? await db.query.users.findFirst({
                where: eq(users.id, existingUser.id),
                columns: { id: true, name: true, email: true, image: true },
              })
            : null,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating folder share:', error)
    return NextResponse.json({ error: 'Failed to create folder share' }, { status: 500 })
  }
}

async function getMaxOrgPosition(userId: string): Promise<number> {
  const entries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  return entries.length > 0 ? entries[0].position : -1
}
