import { db } from '@/lib/db'
import { notifications, notificationPreferences, channelShares, channels } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { publishNotificationToUser } from '@/lib/sync/pusherServer'
import type { NotificationType } from './types'

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Create a notification for a user.
 * Checks user preferences before creating. Publishes via Pusher.
 */
export async function createNotification(input: CreateNotificationInput): Promise<boolean> {
  try {
    // Check user preferences — skip if type is disabled
    const prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, input.userId),
    })

    if (prefs?.disabledTypes && Array.isArray(prefs.disabledTypes)) {
      if (prefs.disabledTypes.includes(input.type)) {
        return false
      }
    }

    const id = crypto.randomUUID()
    const now = new Date()

    await db.insert(notifications).values({
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      isRead: false,
      createdAt: now,
    })

    // Publish via Pusher
    await publishNotificationToUser(input.userId, {
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      isRead: false,
      createdAt: now.toISOString(),
      readAt: null,
    })

    return true
  } catch (error) {
    console.error('[Notifications] Failed to create notification:', error)
    return false
  }
}

/**
 * Create notifications for all members of a channel, excluding the actor.
 */
export async function createNotificationForChannelMembers(
  channelId: string,
  actorUserId: string,
  input: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  try {
    // Get channel owner
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      columns: { ownerId: true },
    })

    // Get all shares for this channel
    const shares = await db.query.channelShares.findMany({
      where: and(
        eq(channelShares.channelId, channelId),
      ),
    })

    // Collect all user IDs (owner + shared users), exclude actor
    const userIds = new Set<string>()
    if (channel?.ownerId && channel.ownerId !== actorUserId) {
      userIds.add(channel.ownerId)
    }
    for (const share of shares) {
      if (share.userId && share.userId !== actorUserId && share.acceptedAt) {
        userIds.add(share.userId)
      }
    }

    // Create notification for each user (fire and forget)
    await Promise.allSettled(
      Array.from(userIds).map(userId =>
        createNotification({ ...input, userId })
      )
    )
  } catch (error) {
    console.error('[Notifications] Failed to create channel member notifications:', error)
  }
}
