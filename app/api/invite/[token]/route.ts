import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  channelInviteLinks,
  channels,
  channelShares,
  userChannelOrg,
  users,
} from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createNotification } from '@/lib/notifications/createNotification'

interface RouteParams {
  params: Promise<{ token: string }>
}

/**
 * GET /api/invite/:token
 * Get info about an invite link (public, but limited info if not authenticated)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { token } = await params

  // Find the invite link
  const link = await db.query.channelInviteLinks.findFirst({
    where: eq(channelInviteLinks.token, token),
  })

  if (!link) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })
  }

  // Check if expired
  if (link.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 })
  }

  // Check if exhausted
  if (link.maxUses && (link.useCount ?? 0) >= link.maxUses) {
    return NextResponse.json(
      { error: 'This invite link has reached its maximum uses' },
      { status: 410 }
    )
  }

  // Get channel info (limited)
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, link.channelId),
    columns: { id: true, name: true, description: true },
  })

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Get owner info
  const fullChannel = await db.query.channels.findFirst({
    where: eq(channels.id, link.channelId),
    columns: { ownerId: true },
  })

  const owner = fullChannel
    ? await db.query.users.findFirst({
        where: eq(users.id, fullChannel.ownerId),
        columns: { name: true, image: true },
      })
    : null

  // Check if user is authenticated and already has access
  const session = await auth()
  let hasAccess = false
  let role: string | null = null

  if (session?.user?.id) {
    // Check if owner
    if (fullChannel?.ownerId === session.user.id) {
      hasAccess = true
      role = 'owner'
    } else {
      // Check if has share
      const existingShare = await db.query.channelShares.findFirst({
        where: and(
          eq(channelShares.channelId, link.channelId),
          eq(channelShares.userId, session.user.id)
        ),
      })

      if (existingShare) {
        hasAccess = true
        role = existingShare.role
      }
    }
  }

  return NextResponse.json({
    invite: {
      channelId: channel.id,
      channelName: channel.name,
      channelDescription: channel.description,
      ownerName: owner?.name,
      ownerImage: owner?.image,
      defaultRole: link.defaultRole,
      requiresApproval: link.requiresApproval,
    },
    userStatus: {
      isAuthenticated: !!session?.user?.id,
      hasAccess,
      role,
    },
  })
}

/**
 * POST /api/invite/:token
 * Accept an invite link (requires authentication)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'You must be signed in to accept this invite' },
      { status: 401 }
    )
  }

  const { token } = await params
  const userId = session.user.id

  // Find the invite link
  const link = await db.query.channelInviteLinks.findFirst({
    where: eq(channelInviteLinks.token, token),
  })

  if (!link) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })
  }

  // Check if expired
  if (link.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 })
  }

  // Check if exhausted
  if (link.maxUses && (link.useCount ?? 0) >= link.maxUses) {
    return NextResponse.json(
      { error: 'This invite link has reached its maximum uses' },
      { status: 410 }
    )
  }

  // Check if user is the owner
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, link.channelId),
    columns: { id: true, ownerId: true, name: true },
  })

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  if (channel.ownerId === userId) {
    return NextResponse.json(
      { error: 'You are already the owner of this channel' },
      { status: 400 }
    )
  }

  // Check if user already has access
  const existingShare = await db.query.channelShares.findFirst({
    where: and(
      eq(channelShares.channelId, link.channelId),
      eq(channelShares.userId, userId)
    ),
  })

  if (existingShare) {
    return NextResponse.json(
      { error: 'You already have access to this channel' },
      { status: 400 }
    )
  }

  const now = new Date()

  // If requires approval, create pending share
  if (link.requiresApproval) {
    // Get user email
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    })

    const shareId = nanoid()
    await db.insert(channelShares).values({
      id: shareId,
      channelId: link.channelId,
      userId: null, // Will be set when approved
      email: user?.email?.toLowerCase(),
      role: link.defaultRole ?? 'viewer',
      invitedBy: link.createdBy,
      invitedAt: now,
      acceptedAt: null,
    })

    return NextResponse.json({
      status: 'pending_approval',
      message: 'Your access request has been submitted. The channel owner will review it.',
    })
  }

  // Create share and org entry
  const shareId = nanoid()
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  })

  await db.insert(channelShares).values({
    id: shareId,
    channelId: link.channelId,
    userId,
    email: user?.email?.toLowerCase(),
    role: link.defaultRole ?? 'viewer',
    invitedBy: link.createdBy,
    invitedAt: now,
    acceptedAt: now,
  })

  // Add to user's channel organization
  const maxPosition = await getMaxOrgPosition(userId)
  await db.insert(userChannelOrg).values({
    userId,
    channelId: link.channelId,
    position: maxPosition + 1,
  })

  // Increment use count
  await db
    .update(channelInviteLinks)
    .set({ useCount: (link.useCount ?? 0) + 1 })
    .where(eq(channelInviteLinks.id, link.id))

  // Notify channel owner that someone joined via invite link
  if (channel.ownerId !== userId) {
    const joiningUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { name: true, email: true },
    })
    createNotification({
      userId: channel.ownerId,
      type: 'channel_join_via_link',
      title: 'New member joined',
      body: `${joiningUser?.name || joiningUser?.email || 'Someone'} joined "${channel.name}" via invite link`,
      data: { channelId: link.channelId },
    }).catch(() => {})
  }

  return NextResponse.json({
    status: 'accepted',
    channelId: link.channelId,
    channelName: channel.name,
    role: link.defaultRole,
  })
}

async function getMaxOrgPosition(userId: string): Promise<number> {
  const entries = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  return entries.length > 0 ? entries[0].position : -1
}
