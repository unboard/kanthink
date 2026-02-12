import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { folderShares, channelShares, folders, userChannelOrg } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ id: string; shareId: string }>
}

/**
 * PATCH /api/folders/:id/shares/:shareId
 * Update a folder share's role (cascades to all channel shares)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId, shareId } = await params
  const userId = session.user.id

  try {
    // Verify folder ownership
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    const body = await req.json()
    const { role } = body

    if (!role || !['editor', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "viewer"' },
        { status: 400 }
      )
    }

    // Find the folder share
    const share = await db.query.folderShares.findFirst({
      where: and(
        eq(folderShares.id, shareId),
        eq(folderShares.folderId, folderId)
      ),
    })

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    // Update folder share role
    await db
      .update(folderShares)
      .set({ role })
      .where(eq(folderShares.id, shareId))

    // Cascade: update all channel shares that came from this folder share
    await db
      .update(channelShares)
      .set({ role })
      .where(eq(channelShares.folderShareId, shareId))

    const updatedShare = await db.query.folderShares.findFirst({
      where: eq(folderShares.id, shareId),
    })

    return NextResponse.json({
      share: {
        id: updatedShare?.id,
        folderId: updatedShare?.folderId,
        userId: updatedShare?.userId,
        email: updatedShare?.email,
        role: updatedShare?.role,
        invitedBy: updatedShare?.invitedBy,
        invitedAt: updatedShare?.invitedAt?.toISOString(),
        acceptedAt: updatedShare?.acceptedAt?.toISOString(),
        isPending: !updatedShare?.acceptedAt,
      },
    })
  } catch (error) {
    console.error('Error updating folder share:', error)
    return NextResponse.json({ error: 'Failed to update folder share' }, { status: 500 })
  }
}

/**
 * DELETE /api/folders/:id/shares/:shareId
 * Revoke a folder share (cascades: removes all channel shares from this folder share)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: folderId, shareId } = await params
  const userId = session.user.id

  try {
    // Verify folder ownership
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Find the folder share
    const share = await db.query.folderShares.findFirst({
      where: and(
        eq(folderShares.id, shareId),
        eq(folderShares.folderId, folderId)
      ),
    })

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    // Find all channel shares that came from this folder share
    const relatedChannelShares = await db.query.channelShares.findMany({
      where: eq(channelShares.folderShareId, shareId),
    })

    // Remove userChannelOrg entries for the shared user
    if (share.userId) {
      for (const cs of relatedChannelShares) {
        await db
          .delete(userChannelOrg)
          .where(
            and(
              eq(userChannelOrg.userId, share.userId),
              eq(userChannelOrg.channelId, cs.channelId)
            )
          )
      }
    }

    // Delete all channel shares from this folder share
    for (const cs of relatedChannelShares) {
      await db.delete(channelShares).where(eq(channelShares.id, cs.id))
    }

    // Delete the folder share itself
    await db.delete(folderShares).where(eq(folderShares.id, shareId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting folder share:', error)
    return NextResponse.json({ error: 'Failed to delete folder share' }, { status: 500 })
  }
}
