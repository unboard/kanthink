/**
 * API endpoint for broadcasting events to Pusher channels.
 * Clients call this to publish their local changes to other connected clients.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { channels, channelShares } from '@/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { publishToChannel, publishToUser, isPusherConfigured } from '@/lib/sync/pusherServer'
import type { BroadcastEvent } from '@/lib/sync/broadcastSync'

interface BroadcastRequest {
  event: BroadcastEvent
  channelId?: string  // For channel-scoped events
  senderId: string
}

// Events that are user-scoped (sent to user's personal channel)
const USER_SCOPED_EVENTS = new Set([
  'folder:create',
  'folder:update',
  'folder:delete',
  'folder:reorder',
  'folder:toggleCollapse',
  'channel:moveToFolder',
  'channel:reorderInFolder',
  'channel:reorder',
])

// Events that require write access to the channel
const WRITE_EVENTS = new Set([
  'channel:update',
  'channel:delete',
  'column:create',
  'column:update',
  'column:delete',
  'column:reorder',
  'card:create',
  'card:update',
  'card:delete',
  'card:deleteAllInColumn',
  'card:move',
  'card:archive',
  'card:unarchive',
  'card:addMessage',
  'card:addAIResponse',
  'card:updateMessageAction',
  'card:editMessage',
  'card:deleteMessage',
  'card:setSummary',
  'card:setCoverImage',
  'task:create',
  'task:update',
  'task:delete',
  'task:complete',
  'task:toggleStatus',
  'task:reorder',
  'task:reorderUnlinked',
  'property:addDefinition',
  'property:removeDefinition',
  'card:setProperty',
  'card:removeProperty',
  'card:setProperties',
  'card:recordInstructionRun',
  'card:clearInstructionRun',
  'tag:addDefinition',
  'tag:updateDefinition',
  'tag:removeDefinition',
  'card:addTag',
  'card:removeTag',
  'question:add',
  'question:answer',
  'question:dismiss',
  'instruction:addRevision',
  'instruction:rollback',
  'instruction:setSuggestionMode',
  'instructionCard:create',
  'instructionCard:update',
  'instructionCard:delete',
  'instructionCard:reorder',
  'instructionRun:save',
  'instructionRun:undo',
])

export async function POST(request: NextRequest) {
  // Check if Pusher is configured
  if (!isPusherConfigured()) {
    // Silently succeed if Pusher isn't configured - client shouldn't care
    return NextResponse.json({ success: true, pusherDisabled: true })
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

  // Parse request body
  let body: BroadcastRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  const { event, channelId, senderId } = body

  if (!event || !senderId) {
    return NextResponse.json(
      { error: 'Missing event or senderId' },
      { status: 400 }
    )
  }

  // Check if this is a user-scoped event
  if (USER_SCOPED_EVENTS.has(event.type)) {
    // Publish to user's personal channel
    await publishToUser(userId, event, senderId)
    return NextResponse.json({ success: true })
  }

  // For channel-scoped events, channelId is required
  if (!channelId) {
    return NextResponse.json(
      { error: 'channelId required for channel-scoped events' },
      { status: 400 }
    )
  }

  // Check user's access to the channel
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

  if (!ownedChannel && !share) {
    return NextResponse.json(
      { error: 'No access to this channel' },
      { status: 403 }
    )
  }

  // For write events, verify user has write access
  if (WRITE_EVENTS.has(event.type)) {
    const isOwner = !!ownedChannel
    const isEditor = share?.role === 'editor' || share?.role === 'owner'

    if (!isOwner && !isEditor) {
      return NextResponse.json(
        { error: 'Write access required' },
        { status: 403 }
      )
    }
  }

  // Publish to the channel
  await publishToChannel(channelId, event, senderId)

  return NextResponse.json({ success: true })
}
