/**
 * Pusher authentication endpoint for private channels.
 * Verifies the user has access to the requested channel before allowing subscription.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, channelShares } from '@/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { authenticateChannel, authenticatePresence, isPusherConfigured, getUserColor } from '@/lib/sync/pusherServer'

export async function POST(request: NextRequest) {
  // Check if Pusher is configured
  if (!isPusherConfigured()) {
    return NextResponse.json(
      { error: 'Pusher not configured' },
      { status: 503 }
    )
  }

  // Get authenticated user
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const userId = session.user.id

  // Parse form data (Pusher sends as form-encoded)
  const formData = await request.formData()
  const socketId = formData.get('socket_id') as string
  const pusherChannel = formData.get('channel_name') as string
  // Client sends a unique tab ID for presence channels
  const tabId = formData.get('tab_id') as string | null

  if (!socketId || !pusherChannel) {
    return NextResponse.json(
      { error: 'Missing socket_id or channel_name' },
      { status: 400 }
    )
  }

  // Parse the channel name to determine what we're authorizing
  // Format: private-channel-{channelId} or private-user-{userId}

  if (pusherChannel.startsWith('private-user-')) {
    // User channel - only allow the user to subscribe to their own channel
    const requestedUserId = pusherChannel.replace('private-user-', '')

    if (requestedUserId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden - cannot subscribe to other user channels' },
        { status: 403 }
      )
    }

    // Authorize the user channel
    try {
      const authResponse = authenticateChannel(socketId, pusherChannel)
      return NextResponse.json(authResponse)
    } catch (error) {
      console.error('[Pusher Auth] Failed to authenticate user channel:', error)
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      )
    }
  }

  if (pusherChannel.startsWith('presence-channel-')) {
    // Presence channel subscription - verify user has access and return user info
    const channelId = pusherChannel.replace('presence-channel-', '')

    // Check if user owns the channel or has been granted access
    const [ownedChannel, share] = await Promise.all([
      db.query.channels.findFirst({
        where: and(
          eq(channels.id, channelId),
          eq(channels.ownerId, userId)
        ),
      }),
      db.query.channelShares.findFirst({
        where: and(
          eq(channelShares.channelId, channelId),
          or(
            eq(channelShares.userId, userId),
            eq(channelShares.email, session.user.email ?? '')
          )
        ),
      }),
    ])

    // Also check for global help channels (accessible to all authenticated users)
    let isGlobalHelp = false
    if (!ownedChannel && !share) {
      const globalChannel = await db.query.channels.findFirst({
        where: and(
          eq(channels.id, channelId),
          eq(channels.isGlobalHelp, true)
        ),
      })
      isGlobalHelp = !!globalChannel
    }

    if (!ownedChannel && !share && !isGlobalHelp) {
      return NextResponse.json(
        { error: 'Forbidden - no access to this channel' },
        { status: 403 }
      )
    }

    // Authorize the presence channel with user info
    // Use tabId to make each browser tab unique in presence (allows same user on multiple tabs/devices)
    try {
      const presenceId = tabId ? `${userId}:${tabId}` : userId
      const userInfo = {
        id: presenceId,
        name: session.user.name || session.user.email || 'Anonymous',
        image: session.user.image || null,
        color: getUserColor(userId), // Color based on actual userId for consistency
      }
      const authResponse = authenticatePresence(socketId, pusherChannel, userInfo)
      return NextResponse.json(authResponse)
    } catch (error) {
      console.error('[Pusher Auth] Failed to authenticate presence channel:', error)
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      )
    }
  }

  if (pusherChannel.startsWith('private-channel-')) {
    // Channel subscription - verify user has access
    const channelId = pusherChannel.replace('private-channel-', '')

    // Check if user owns the channel or has been granted access
    const [ownedChannel, share] = await Promise.all([
      db.query.channels.findFirst({
        where: and(
          eq(channels.id, channelId),
          eq(channels.ownerId, userId)
        ),
      }),
      db.query.channelShares.findFirst({
        where: and(
          eq(channelShares.channelId, channelId),
          or(
            eq(channelShares.userId, userId),
            eq(channelShares.email, session.user.email ?? '')
          )
        ),
      }),
    ])

    // Also check for global help channels (accessible to all authenticated users)
    let isGlobalHelp = false
    if (!ownedChannel && !share) {
      const globalChannel = await db.query.channels.findFirst({
        where: and(
          eq(channels.id, channelId),
          eq(channels.isGlobalHelp, true)
        ),
      })
      isGlobalHelp = !!globalChannel
    }

    if (!ownedChannel && !share && !isGlobalHelp) {
      return NextResponse.json(
        { error: 'Forbidden - no access to this channel' },
        { status: 403 }
      )
    }

    // Authorize the channel subscription
    try {
      const authResponse = authenticateChannel(socketId, pusherChannel)
      return NextResponse.json(authResponse)
    } catch (error) {
      console.error('[Pusher Auth] Failed to authenticate channel:', error)
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      )
    }
  }

  // Unknown channel format
  return NextResponse.json(
    { error: 'Invalid channel format' },
    { status: 400 }
  )
}
