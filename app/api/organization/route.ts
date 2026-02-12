import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folders, userChannelOrg, folderShares, channelShares } from '@/lib/db/schema'
import { eq, and, gte, lte, gt, lt, sql, asc, isNull, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * POST /api/organization
 * Update channel and folder ordering
 *
 * Supports multiple operations:
 * - Move a channel to a different folder
 * - Reorder channels within a folder
 * - Reorder channels at root level
 * - Reorder folders
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const body = await req.json()
    const { operation } = body

    switch (operation) {
      case 'moveChannelToFolder':
        return await moveChannelToFolder(userId, body)
      case 'reorderChannelInFolder':
        return await reorderChannelInFolder(userId, body)
      case 'reorderChannels':
        return await reorderChannels(userId, body)
      case 'reorderFolders':
        return await reorderFolders(userId, body)
      default:
        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }
}

async function moveChannelToFolder(
  userId: string,
  body: { channelId: string; targetFolderId: string | null }
) {
  const { channelId, targetFolderId } = body

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
  }

  // Find the channel's org entry
  const orgEntry = await db.query.userChannelOrg.findFirst({
    where: and(
      eq(userChannelOrg.userId, userId),
      eq(userChannelOrg.channelId, channelId)
    ),
  })

  if (!orgEntry) {
    return NextResponse.json({ error: 'Channel not found in organization' }, { status: 404 })
  }

  // If target folder is specified, verify it exists and belongs to user
  if (targetFolderId) {
    const targetFolder = await db.query.folders.findFirst({
      where: and(eq(folders.id, targetFolderId), eq(folders.userId, userId)),
    })

    if (!targetFolder) {
      return NextResponse.json({ error: 'Target folder not found' }, { status: 404 })
    }
  }

  // Get max position in target location
  const targetEntries = await db.query.userChannelOrg.findMany({
    where: and(
      eq(userChannelOrg.userId, userId),
      targetFolderId
        ? eq(userChannelOrg.folderId, targetFolderId)
        : isNull(userChannelOrg.folderId)
    ),
    orderBy: [asc(userChannelOrg.position)],
  })

  const maxPosition = targetEntries.length > 0
    ? Math.max(...targetEntries.map(e => e.position))
    : -1

  // Track source folder for cascade cleanup
  const sourceFolderId = orgEntry.folderId

  // Update the channel's folder and position
  await db
    .update(userChannelOrg)
    .set({
      folderId: targetFolderId,
      position: maxPosition + 1,
    })
    .where(eq(userChannelOrg.id, orgEntry.id))

  // Cascade: handle folder share implications
  try {
    // If moving OUT of a shared folder: remove channel shares that came from folder shares
    if (sourceFolderId) {
      const sourceShares = await db.query.folderShares.findMany({
        where: eq(folderShares.folderId, sourceFolderId),
      })

      for (const fs of sourceShares) {
        // Delete channel shares for this channel that came from this folder share
        await db
          .delete(channelShares)
          .where(
            and(
              eq(channelShares.channelId, channelId),
              eq(channelShares.folderShareId, fs.id)
            )
          )

        // Also remove userChannelOrg for the shared user
        if (fs.userId) {
          await db
            .delete(userChannelOrg)
            .where(
              and(
                eq(userChannelOrg.userId, fs.userId),
                eq(userChannelOrg.channelId, channelId)
              )
            )
        }
      }
    }

    // If moving INTO a shared folder: create channel shares for each folder share recipient
    if (targetFolderId) {
      const targetShares = await db.query.folderShares.findMany({
        where: eq(folderShares.folderId, targetFolderId),
      })

      for (const fs of targetShares) {
        // Check if share already exists
        const existing = fs.userId
          ? await db.query.channelShares.findFirst({
              where: and(
                eq(channelShares.channelId, channelId),
                eq(channelShares.userId, fs.userId)
              ),
            })
          : await db.query.channelShares.findFirst({
              where: and(
                eq(channelShares.channelId, channelId),
                eq(channelShares.email, fs.email!)
              ),
            })

        if (existing) continue

        const now = new Date()
        await db.insert(channelShares).values({
          id: nanoid(),
          channelId,
          userId: fs.userId,
          email: fs.email,
          role: fs.role,
          folderShareId: fs.id,
          invitedBy: fs.invitedBy,
          invitedAt: now,
          acceptedAt: fs.acceptedAt ? now : null,
        })

        // Create userChannelOrg entry if user exists
        if (fs.userId) {
          const maxPos = await getMaxOrgPositionForUser(fs.userId)
          try {
            await db.insert(userChannelOrg).values({
              userId: fs.userId,
              channelId,
              position: maxPos + 1,
            })
          } catch {
            // Ignore duplicate entry
          }
        }
      }
    }
  } catch (e) {
    // Log but don't fail the move operation
    console.warn('Error cascading folder shares on channel move:', e)
  }

  return NextResponse.json({ success: true })
}

async function getMaxOrgPositionForUser(userId: string): Promise<number> {
  const entries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  return entries.length > 0 ? entries[0].position : -1
}

async function reorderChannelInFolder(
  userId: string,
  body: { channelId: string; folderId: string | null; fromIndex: number; toIndex: number }
) {
  const { channelId, folderId, fromIndex, toIndex } = body

  if (!channelId || fromIndex === undefined || toIndex === undefined) {
    return NextResponse.json(
      { error: 'channelId, fromIndex, and toIndex are required' },
      { status: 400 }
    )
  }

  if (fromIndex === toIndex) {
    return NextResponse.json({ success: true })
  }

  // Get all channels in the folder/root
  const entries = await db.query.userChannelOrg.findMany({
    where: and(
      eq(userChannelOrg.userId, userId),
      folderId
        ? eq(userChannelOrg.folderId, folderId)
        : isNull(userChannelOrg.folderId)
    ),
    orderBy: [asc(userChannelOrg.position)],
  })

  // Find the entry for the channel being moved
  const movingEntry = entries.find(e => e.channelId === channelId)
  if (!movingEntry) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Reorder using position shifting
  if (fromIndex < toIndex) {
    // Moving down
    await db
      .update(userChannelOrg)
      .set({ position: sql`${userChannelOrg.position} - 1` })
      .where(
        and(
          eq(userChannelOrg.userId, userId),
          folderId
            ? eq(userChannelOrg.folderId, folderId)
            : isNull(userChannelOrg.folderId),
          gt(userChannelOrg.position, fromIndex),
          lte(userChannelOrg.position, toIndex)
        )
      )
  } else {
    // Moving up
    await db
      .update(userChannelOrg)
      .set({ position: sql`${userChannelOrg.position} + 1` })
      .where(
        and(
          eq(userChannelOrg.userId, userId),
          folderId
            ? eq(userChannelOrg.folderId, folderId)
            : isNull(userChannelOrg.folderId),
          gte(userChannelOrg.position, toIndex),
          lt(userChannelOrg.position, fromIndex)
        )
      )
  }

  // Update the moving channel's position
  await db
    .update(userChannelOrg)
    .set({ position: toIndex })
    .where(eq(userChannelOrg.id, movingEntry.id))

  return NextResponse.json({ success: true })
}

async function reorderChannels(
  userId: string,
  body: { channelOrder: string[] }
) {
  const { channelOrder } = body

  if (!Array.isArray(channelOrder)) {
    return NextResponse.json({ error: 'channelOrder array is required' }, { status: 400 })
  }

  // Update positions for all root-level channels
  for (let i = 0; i < channelOrder.length; i++) {
    await db
      .update(userChannelOrg)
      .set({ position: i })
      .where(
        and(
          eq(userChannelOrg.userId, userId),
          eq(userChannelOrg.channelId, channelOrder[i]),
          isNull(userChannelOrg.folderId)
        )
      )
  }

  return NextResponse.json({ success: true })
}

async function reorderFolders(
  userId: string,
  body: { folderId: string; fromIndex: number; toIndex: number }
) {
  const { folderId, fromIndex, toIndex } = body

  if (!folderId || fromIndex === undefined || toIndex === undefined) {
    return NextResponse.json(
      { error: 'folderId, fromIndex, and toIndex are required' },
      { status: 400 }
    )
  }

  if (fromIndex === toIndex) {
    return NextResponse.json({ success: true })
  }

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  })

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  // Reorder using position shifting
  if (fromIndex < toIndex) {
    // Moving down
    await db
      .update(folders)
      .set({ position: sql`${folders.position} - 1` })
      .where(
        and(
          eq(folders.userId, userId),
          gt(folders.position, fromIndex),
          lte(folders.position, toIndex)
        )
      )
  } else {
    // Moving up
    await db
      .update(folders)
      .set({ position: sql`${folders.position} + 1` })
      .where(
        and(
          eq(folders.userId, userId),
          gte(folders.position, toIndex),
          lt(folders.position, fromIndex)
        )
      )
  }

  // Update the moving folder's position
  await db.update(folders).set({ position: toIndex }).where(eq(folders.id, folderId))

  return NextResponse.json({ success: true })
}
