import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelInviteLinks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string; linkId: string }>
}

/**
 * DELETE /api/channels/:id/invite-links/:linkId
 * Revoke an invite link
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId, linkId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

    // Find the link
    const link = await db.query.channelInviteLinks.findFirst({
      where: and(
        eq(channelInviteLinks.id, linkId),
        eq(channelInviteLinks.channelId, channelId)
      ),
    })

    if (!link) {
      return NextResponse.json({ error: 'Invite link not found' }, { status: 404 })
    }

    // Delete the link
    await db.delete(channelInviteLinks).where(eq(channelInviteLinks.id, linkId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting invite link:', error)
    return NextResponse.json({ error: 'Failed to delete invite link' }, { status: 500 })
  }
}
