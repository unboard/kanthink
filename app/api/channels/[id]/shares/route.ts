import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channelShares, channels, users, userChannelOrg } from '@/lib/db/schema'
import { eq, and, or, desc } from 'drizzle-orm'
import { requirePermission, PermissionError, ChannelRole } from '@/lib/api/permissions'
import { nanoid } from 'nanoid'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/channels/:id/shares
 * List all shares for a channel
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    // Only owner can view shares
    await requirePermission(channelId, userId, 'manage_shares')

    // Get all shares for this channel
    const shares = await db.query.channelShares.findMany({
      where: eq(channelShares.channelId, channelId),
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

    // Get inviter info
    const inviterIds = shares.filter(s => s.invitedBy).map(s => s.invitedBy!)
    const inviters = inviterIds.length > 0
      ? await db.query.users.findMany({
          where: or(...inviterIds.map(id => eq(users.id, id))),
          columns: { id: true, name: true, email: true },
        })
      : []

    const inviterMap = new Map(inviters.map(u => [u.id, u]))

    // Get channel owner info
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      columns: { ownerId: true },
    })

    const owner = channel
      ? await db.query.users.findFirst({
          where: eq(users.id, channel.ownerId),
          columns: { id: true, name: true, email: true, image: true },
        })
      : null

    return NextResponse.json({
      owner: owner ? { ...owner, role: 'owner' as ChannelRole } : null,
      shares: shares.map(share => ({
        id: share.id,
        channelId: share.channelId,
        userId: share.userId,
        email: share.email,
        role: share.role,
        user: share.userId ? userMap.get(share.userId) : null,
        invitedBy: share.invitedBy ? inviterMap.get(share.invitedBy) : null,
        invitedAt: share.invitedAt?.toISOString(),
        acceptedAt: share.acceptedAt?.toISOString(),
        isPending: !share.acceptedAt,
      })),
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching shares:', error)
    return NextResponse.json({ error: 'Failed to fetch shares' }, { status: 500 })
  }
}

/**
 * POST /api/channels/:id/shares
 * Create a new share (invite by email)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'manage_shares')

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

    // Check if user already has access
    const existingShare = await db.query.channelShares.findFirst({
      where: and(
        eq(channelShares.channelId, channelId),
        or(
          eq(channelShares.email, normalizedEmail),
          // Check if user with this email already has access
          eq(channelShares.userId, await findUserIdByEmail(normalizedEmail) || '')
        )
      ),
    })

    if (existingShare) {
      return NextResponse.json(
        { error: 'User already has access to this channel' },
        { status: 409 }
      )
    }

    // Check if this email is the owner
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      columns: { ownerId: true },
    })

    if (channel) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, channel.ownerId),
        columns: { email: true },
      })

      if (owner?.email?.toLowerCase() === normalizedEmail) {
        return NextResponse.json(
          { error: 'Cannot share with channel owner' },
          { status: 400 }
        )
      }
    }

    // Check if user with this email exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      columns: { id: true },
    })

    const shareId = nanoid()
    const now = new Date()

    await db.insert(channelShares).values({
      id: shareId,
      channelId,
      userId: existingUser?.id || null,
      email: normalizedEmail,
      role: role as ChannelRole,
      invitedBy: userId,
      invitedAt: now,
      acceptedAt: existingUser ? now : null, // Auto-accept if user exists
    })

    // If user exists, also create userChannelOrg entry
    if (existingUser) {
      const maxPosition = await getMaxOrgPosition(existingUser.id)
      await db.insert(userChannelOrg).values({
        userId: existingUser.id,
        channelId,
        position: maxPosition + 1,
      })
    }

    const createdShare = await db.query.channelShares.findFirst({
      where: eq(channelShares.id, shareId),
    })

    return NextResponse.json(
      {
        share: {
          ...createdShare,
          invitedAt: createdShare?.invitedAt?.toISOString(),
          acceptedAt: createdShare?.acceptedAt?.toISOString(),
          isPending: !createdShare?.acceptedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating share:', error)
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 })
  }
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    columns: { id: true },
  })
  return user?.id || null
}

async function getMaxOrgPosition(userId: string): Promise<number> {
  const entries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  return entries.length > 0 ? entries[0].position : -1
}
