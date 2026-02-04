/**
 * Server-side Pusher client for publishing real-time events.
 * Used by API routes to broadcast changes to all connected clients.
 */

import Pusher from 'pusher'
import type { BroadcastEvent } from './broadcastSync'

// Lazy-initialized Pusher instance
let pusherInstance: Pusher | null = null

/**
 * Get the Pusher server instance (lazy initialization).
 * Returns null if Pusher is not configured.
 */
function getPusher(): Pusher | null {
  if (pusherInstance) {
    return pusherInstance
  }

  const appId = process.env.PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER

  if (!appId || !key || !secret || !cluster) {
    // Pusher not configured - real-time sync will be disabled
    return null
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  })

  return pusherInstance
}

/**
 * Event payload sent through Pusher.
 */
export interface PusherEventPayload {
  event: BroadcastEvent
  eventId: string
  senderId: string
  timestamp: number
}

/**
 * Publish an event to a channel's Pusher channel.
 * All users with access to the channel will receive this event.
 *
 * @param channelId - The Kanthink channel ID
 * @param event - The broadcast event to publish
 * @param senderId - The client ID of the sender (to prevent echo)
 * @param eventId - Unique event ID for deduplication
 */
export async function publishToChannel(
  channelId: string,
  event: BroadcastEvent,
  senderId: string,
  eventId: string
): Promise<boolean> {
  const pusher = getPusher()
  if (!pusher) {
    return false
  }

  const payload: PusherEventPayload = {
    event,
    eventId,
    senderId,
    timestamp: Date.now(),
  }

  try {
    await pusher.trigger(`private-channel-${channelId}`, 'sync', payload)
    return true
  } catch (error) {
    console.error('[Pusher] Failed to publish to channel:', channelId, error)
    return false
  }
}

/**
 * Publish an event to a user's personal Pusher channel.
 * Used for user-scoped events like folder changes.
 *
 * @param userId - The user ID
 * @param event - The broadcast event to publish
 * @param senderId - The client ID of the sender (to prevent echo)
 * @param eventId - Unique event ID for deduplication
 */
export async function publishToUser(
  userId: string,
  event: BroadcastEvent,
  senderId: string,
  eventId: string
): Promise<boolean> {
  const pusher = getPusher()
  if (!pusher) {
    return false
  }

  const payload: PusherEventPayload = {
    event,
    eventId,
    senderId,
    timestamp: Date.now(),
  }

  try {
    await pusher.trigger(`private-user-${userId}`, 'sync', payload)
    return true
  } catch (error) {
    console.error('[Pusher] Failed to publish to user:', userId, error)
    return false
  }
}

/**
 * Authenticate a user for a private Pusher channel.
 * Returns the auth signature if authorized, throws if not.
 *
 * @param socketId - The Pusher socket ID
 * @param pusherChannel - The Pusher channel name (e.g., "private-channel-xxx")
 */
export function authenticateChannel(
  socketId: string,
  pusherChannel: string
): { auth: string } {
  const pusher = getPusher()
  if (!pusher) {
    throw new Error('Pusher not configured')
  }

  return pusher.authorizeChannel(socketId, pusherChannel)
}

/**
 * User info for presence channels.
 */
export interface PresenceUserInfo {
  id: string
  name: string
  image: string | null
  color: string
}

/**
 * Authenticate a user for a presence Pusher channel.
 * Returns the auth signature with user info, throws if not authorized.
 *
 * @param socketId - The Pusher socket ID
 * @param pusherChannel - The Pusher channel name (e.g., "presence-channel-xxx")
 * @param userInfo - The user information to include in presence data
 */
export function authenticatePresence(
  socketId: string,
  pusherChannel: string,
  userInfo: PresenceUserInfo
): { auth: string; channel_data: string } {
  const pusher = getPusher()
  if (!pusher) {
    throw new Error('Pusher not configured')
  }

  const presenceData = {
    user_id: userInfo.id,
    user_info: {
      name: userInfo.name,
      image: userInfo.image,
      color: userInfo.color,
    },
  }

  return pusher.authorizeChannel(socketId, pusherChannel, presenceData) as {
    auth: string
    channel_data: string
  }
}

/**
 * Generate a consistent color for a user based on their ID.
 */
export function getUserColor(userId: string): string {
  // Vibrant colors that work well for cursors
  const colors = [
    '#EF4444', // red
    '#F97316', // orange
    '#EAB308', // yellow
    '#22C55E', // green
    '#14B8A6', // teal
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
  ]

  // Simple hash function for consistent color assignment
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length]
}

/**
 * Check if Pusher is configured and available.
 */
export function isPusherConfigured(): boolean {
  return getPusher() !== null
}
