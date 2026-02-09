import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelShares, channels, users } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/channels/:id/members
 * Returns all active members of a channel (owner + accepted shares)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'view')

    // Get channel owner
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      columns: { ownerId: true },
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Get owner info
    const owner = await db.query.users.findFirst({
      where: eq(users.id, channel.ownerId),
      columns: { id: true, name: true, email: true, image: true },
    })

    // Get accepted shares
    const shares = await db.query.channelShares.findMany({
      where: eq(channelShares.channelId, channelId),
    })

    const acceptedUserIds = shares
      .filter(s => s.userId && s.acceptedAt)
      .map(s => s.userId!)

    const shareUsers = acceptedUserIds.length > 0
      ? await db.query.users.findMany({
          where: or(...acceptedUserIds.map(id => eq(users.id, id))),
          columns: { id: true, name: true, email: true, image: true },
        })
      : []

    // Build members list: owner first, then accepted share users
    const members = []

    if (owner) {
      members.push({
        id: owner.id,
        name: owner.name ?? owner.email,
        email: owner.email,
        image: owner.image,
      })
    }

    for (const user of shareUsers) {
      // Don't duplicate the owner
      if (user.id === channel.ownerId) continue
      members.push({
        id: user.id,
        name: user.name ?? user.email,
        email: user.email,
        image: user.image,
      })
    }

    return NextResponse.json({ members })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching members:', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }
}
