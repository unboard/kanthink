import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folders, userChannelOrg } from '@/lib/db/schema'
import { eq, and, gt, sql, asc, desc } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/folders/:id
 * Update a folder
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId } = await params
  const userId = session.user.id

  try {
    // Verify folder belongs to user
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name, isCollapsed } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (name !== undefined) updates.name = name
    if (isCollapsed !== undefined) updates.isCollapsed = isCollapsed

    await db.update(folders).set(updates).where(eq(folders.id, folderId))

    const updatedFolder = await db.query.folders.findFirst({
      where: eq(folders.id, folderId),
    })

    return NextResponse.json({
      folder: {
        ...updatedFolder,
        createdAt: updatedFolder?.createdAt?.toISOString(),
        updatedAt: updatedFolder?.updatedAt?.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error updating folder:', error)
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 })
  }
}

/**
 * DELETE /api/folders/:id
 * Delete a folder (moves channels to root)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId } = await params
  const userId = session.user.id

  try {
    // Verify folder belongs to user
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Get max position of root-level channels
    const rootChannels = await db.query.userChannelOrg.findMany({
      where: and(
        eq(userChannelOrg.userId, userId),
        eq(userChannelOrg.folderId, null as unknown as string)
      ),
      orderBy: [desc(userChannelOrg.position)],
      limit: 1,
    })

    const maxRootPosition = rootChannels.length > 0 ? rootChannels[0].position : -1

    // Move channels from this folder to root
    const channelsInFolder = await db.query.userChannelOrg.findMany({
      where: and(
        eq(userChannelOrg.userId, userId),
        eq(userChannelOrg.folderId, folderId)
      ),
      orderBy: [asc(userChannelOrg.position)],
    })

    for (let i = 0; i < channelsInFolder.length; i++) {
      await db
        .update(userChannelOrg)
        .set({
          folderId: null,
          position: maxRootPosition + 1 + i,
        })
        .where(eq(userChannelOrg.id, channelsInFolder[i].id))
    }

    // Delete the folder
    await db.delete(folders).where(eq(folders.id, folderId))

    // Shift positions of remaining folders
    await db
      .update(folders)
      .set({ position: sql`${folders.position} - 1` })
      .where(and(eq(folders.userId, userId), gt(folders.position, folder.position)))

    return NextResponse.json({
      success: true,
      movedChannelsCount: channelsInFolder.length,
    })
  } catch (error) {
    console.error('Error deleting folder:', error)
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 })
  }
}
