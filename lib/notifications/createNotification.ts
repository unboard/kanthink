import { db } from '@/lib/db'
import { notifications, notificationPreferences, channelShares, channels, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { publishNotificationToUser } from '@/lib/sync/pusherServer'
import type { NotificationType } from './types'
import { sendTaskAssignedEmail, sendCardAssignedEmail } from '@/lib/emails/send'

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

    // Dispatch email for assignment notifications (respects email preference)
    if (input.type === 'task_assigned' || input.type === 'card_assigned') {
      maybeDispatchEmail(input).catch(() => {})
    }

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

/**
 * Send an email for assignment notifications if user has email enabled.
 */
async function maybeDispatchEmail(input: CreateNotificationInput): Promise<void> {
  // Check email preference
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, input.userId),
  })

  // Default is enabled (true), so only skip if explicitly disabled
  if (prefs && prefs.emailNotificationsEnabled === false) return

  // Also respect disabledTypes
  if (prefs?.disabledTypes && Array.isArray(prefs.disabledTypes)) {
    if (prefs.disabledTypes.includes(input.type)) return
  }

  // Get user email
  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { email: true },
  })
  if (!user?.email) return

  const data = input.data || {}
  const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com'
  const assignerName = (data.assignerName as string) || 'Someone'
  const channelName = (data.channelName as string) || 'a channel'
  const channelId = data.channelId as string

  if (input.type === 'task_assigned') {
    const taskId = data.taskId as string
    sendTaskAssignedEmail(user.email, {
      assignerName,
      taskTitle: input.body,
      channelName,
      taskUrl: `${baseUrl}/channel/${channelId}?task=${taskId}`,
    }).catch(() => {})
  } else if (input.type === 'card_assigned') {
    const cardId = data.cardId as string
    sendCardAssignedEmail(user.email, {
      assignerName,
      cardTitle: input.body,
      channelName,
      cardUrl: `${baseUrl}/channel/${channelId}/card/${cardId}`,
    }).catch(() => {})
  }
}
