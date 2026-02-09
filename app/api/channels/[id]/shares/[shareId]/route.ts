import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelShares, userChannelOrg } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError, ChannelRole } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string; shareId: string }>
}

/**
 * PATCH /api/channels/:id/shares/:shareId
 * Update a share's role
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, shareId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

    const body = await req.json()
    const { role, roleDescription } = body

    // At least one field must be provided
    if (!role && roleDescription === undefined) {
      return NextResponse.json(
        { error: 'Must provide role or roleDescription' },
        { status: 400 }
      )
    }

    if (role && !['editor', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "viewer"' },
        { status: 400 }
      )
    }

    // Find the share
    const share = await db.query.channelShares.findFirst({
      where: and(
        eq(channelShares.id, shareId),
        eq(channelShares.channelId, channelId)
      ),
    })

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    // Build update object with whichever fields are provided
    const updateFields: Record<string, unknown> = {}
    if (role) updateFields.role = role as ChannelRole
    if (roleDescription !== undefined) updateFields.roleDescription = roleDescription

    await db
      .update(channelShares)
      .set(updateFields)
      .where(eq(channelShares.id, shareId))

    const updatedShare = await db.query.channelShares.findFirst({
      where: eq(channelShares.id, shareId),
    })

    return NextResponse.json({
      share: {
        ...updatedShare,
        invitedAt: updatedShare?.invitedAt?.toISOString(),
        acceptedAt: updatedShare?.acceptedAt?.toISOString(),
        isPending: !updatedShare?.acceptedAt,
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error updating share:', error)
    return NextResponse.json({ error: 'Failed to update share' }, { status: 500 })
  }
}

/**
 * DELETE /api/channels/:id/shares/:shareId
 * Remove a share (revoke access)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, shareId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

    // Find the share
    const share = await db.query.channelShares.findFirst({
      where: and(
        eq(channelShares.id, shareId),
        eq(channelShares.channelId, channelId)
      ),
    })

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    // If the user had accepted, remove their organization entry
    if (share.userId) {
      await db
        .delete(userChannelOrg)
        .where(
          and(
            eq(userChannelOrg.userId, share.userId),
            eq(userChannelOrg.channelId, channelId)
          )
        )
    }

    // Delete the share
    await db.delete(channelShares).where(eq(channelShares.id, shareId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting share:', error)
    return NextResponse.json({ error: 'Failed to delete share' }, { status: 500 })
  }
}
