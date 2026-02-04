/**
 * Client-side Pusher subscription manager for real-time sync.
 * Handles subscribing to channels, receiving events, and managing connection state.
 */

import Pusher, { type Channel, type PresenceChannel, type Members } from 'pusher-js'
import type { BroadcastEvent } from './broadcastSync'

/**
 * User presence info from Pusher.
 */
export interface PresenceUser {
  id: string
  info: {
    name: string
    image: string | null
    color: string
  }
}

/**
 * Cursor position data.
 */
export interface CursorPosition {
  x: number
  y: number
  userId: string
  user: PresenceUser
  timestamp: number
}

/**
 * Presence callback types.
 */
type PresenceCallback = (members: PresenceUser[]) => void
type CursorCallback = (cursors: Map<string, CursorPosition>) => void

/**
 * Event payload sent through Pusher.
 * Must match the payload sent by pusherServer.ts
 */
interface PusherEventPayload {
  event: BroadcastEvent
  senderId: string
  timestamp: number
}

// Generate a unique client ID for this browser tab
export const clientId = typeof crypto !== 'undefined'
  ? crypto.randomUUID()
  : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`

// Singleton Pusher instance
let pusherInstance: Pusher | null = null

// Track subscribed channels
const subscriptions = new Map<string, Channel>()

// Track presence subscriptions separately
const presenceSubscriptions = new Map<string, PresenceChannel>()

// Track presence members by channel
const presenceMembers = new Map<string, PresenceUser[]>()

// Track cursor positions by channel
const cursorPositions = new Map<string, Map<string, CursorPosition>>()

// Event callback
type EventCallback = (event: BroadcastEvent) => void
let eventCallback: EventCallback | null = null

// Presence callbacks
let presenceCallback: PresenceCallback | null = null
let cursorCallback: CursorCallback | null = null

// Current channel being viewed (for cursor tracking)
let currentPresenceChannelId: string | null = null

// Current user's ID in the presence channel (set on subscription success)
let myPresenceUserId: string | null = null

/**
 * Initialize the Pusher client connection.
 * Returns false if Pusher is not configured.
 */
export function initPusher(onEvent: EventCallback): boolean {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER

  if (!key || !cluster) {
    console.log('[Pusher Client] Not configured - real-time sync disabled')
    return false
  }

  // Already initialized - don't create a new instance
  if (pusherInstance) {
    eventCallback = onEvent
    return true
  }

  eventCallback = onEvent

  // Pusher.logToConsole = true  // Uncomment for debugging

  pusherInstance = new Pusher(key, {
    cluster,
    forceTLS: true,
    authEndpoint: '/api/pusher/auth',
    auth: {
      params: {
        tab_id: clientId,
      },
    },
  })

  // Connection state logging
  pusherInstance.connection.bind('connected', () => {
    console.log('[Pusher Client] Connected')
  })

  pusherInstance.connection.bind('disconnected', () => {
    console.log('[Pusher Client] Disconnected')
  })

  pusherInstance.connection.bind('error', (err: unknown) => {
    console.error('[Pusher Client] Connection error:', err)
  })

  return true
}

/**
 * Subscribe to a Kanthink channel's Pusher channel.
 * The user must have access to this channel (verified by auth endpoint).
 */
export function subscribeToChannel(channelId: string): void {
  if (!pusherInstance) {
    return
  }

  const pusherChannelName = `private-channel-${channelId}`

  // Already subscribed
  if (subscriptions.has(channelId)) {
    return
  }

  const channel = pusherInstance.subscribe(pusherChannelName)

  channel.bind('sync', (data: PusherEventPayload) => {
    // Ignore events from this client (prevent echo)
    if (data.senderId === clientId) {
      return
    }

    if (eventCallback) {
      eventCallback(data.event)
    }
  })

  channel.bind('pusher:subscription_error', (err: unknown) => {
    console.error(`[Pusher Client] Failed to subscribe to channel ${channelId}:`, err)
  })

  subscriptions.set(channelId, channel)
}

/**
 * Unsubscribe from a Kanthink channel's Pusher channel.
 */
export function unsubscribeFromChannel(channelId: string): void {
  if (!pusherInstance) {
    return
  }

  const pusherChannelName = `private-channel-${channelId}`

  if (subscriptions.has(channelId)) {
    pusherInstance.unsubscribe(pusherChannelName)
    subscriptions.delete(channelId)
  }
}

/**
 * Subscribe to the user's personal channel for user-scoped events.
 */
export function subscribeToUser(userId: string): void {
  if (!pusherInstance) {
    return
  }

  const pusherChannelName = `private-user-${userId}`

  // Use special key for user channel
  const key = `user-${userId}`
  if (subscriptions.has(key)) {
    return
  }

  const channel = pusherInstance.subscribe(pusherChannelName)

  channel.bind('sync', (data: PusherEventPayload) => {
    // Ignore events from this client (prevent echo)
    if (data.senderId === clientId) {
      return
    }

    if (eventCallback) {
      eventCallback(data.event)
    }
  })

  channel.bind('pusher:subscription_error', (err: unknown) => {
    console.error(`[Pusher Client] Failed to subscribe to user channel:`, err)
  })

  subscriptions.set(key, channel)
}

/**
 * Unsubscribe from the user's personal channel.
 */
export function unsubscribeFromUser(userId: string): void {
  if (!pusherInstance) {
    return
  }

  const pusherChannelName = `private-user-${userId}`
  const key = `user-${userId}`

  if (subscriptions.has(key)) {
    pusherInstance.unsubscribe(pusherChannelName)
    subscriptions.delete(key)
  }
}

/**
 * Subscribe to multiple channels at once.
 */
export function subscribeToChannels(channelIds: string[]): void {
  for (const channelId of channelIds) {
    subscribeToChannel(channelId)
  }
}

/**
 * Unsubscribe from all channels and disconnect.
 */
export function disconnect(): void {
  if (!pusherInstance) {
    return
  }

  // Unsubscribe from all channels
  for (const [key] of subscriptions) {
    if (key.startsWith('user-')) {
      pusherInstance.unsubscribe(`private-${key}`)
    } else {
      pusherInstance.unsubscribe(`private-channel-${key}`)
    }
  }
  subscriptions.clear()

  // Unsubscribe from presence channels
  for (const [key] of presenceSubscriptions) {
    pusherInstance.unsubscribe(`presence-channel-${key}`)
  }
  presenceSubscriptions.clear()
  presenceMembers.clear()
  cursorPositions.clear()
  currentPresenceChannelId = null
  myPresenceUserId = null

  // Disconnect
  pusherInstance.disconnect()
  pusherInstance = null
  eventCallback = null
}

/**
 * Check if Pusher is connected and active.
 */
export function isConnected(): boolean {
  return pusherInstance?.connection.state === 'connected'
}

/**
 * Get the list of currently subscribed channel IDs.
 */
export function getSubscribedChannels(): string[] {
  return Array.from(subscriptions.keys()).filter((k) => !k.startsWith('user-'))
}

// ======== PRESENCE CHANNELS ========

/**
 * Set the callback for presence member changes.
 */
export function setPresenceCallback(callback: PresenceCallback | null): void {
  presenceCallback = callback
}

/**
 * Set the callback for cursor position changes.
 */
export function setCursorCallback(callback: CursorCallback | null): void {
  cursorCallback = callback
}

/**
 * Subscribe to a channel's presence for cursor tracking.
 */
export function subscribeToPresence(channelId: string): void {
  if (!pusherInstance) {
    return
  }

  const presenceChannelName = `presence-channel-${channelId}`

  // Already subscribed
  if (presenceSubscriptions.has(channelId)) {
    currentPresenceChannelId = channelId
    return
  }

  const channel = pusherInstance.subscribe(presenceChannelName) as PresenceChannel

  // Initialize cursor map for this channel
  if (!cursorPositions.has(channelId)) {
    cursorPositions.set(channelId, new Map())
  }

  channel.bind('pusher:subscription_succeeded', (members: Members) => {
    // Store my own user ID from the presence channel
    // members.me contains our own member info
    const me = members.me
    myPresenceUserId = me?.id ?? null

    const memberList: PresenceUser[] = []
    members.each((member: { id: string; info: { name: string; image: string | null; color: string } }) => {
      // Don't include self in the member list
      if (member.id !== myPresenceUserId) {
        memberList.push({
          id: member.id,
          info: member.info,
        })
      }
    })
    presenceMembers.set(channelId, memberList)
    if (presenceCallback && channelId === currentPresenceChannelId) {
      presenceCallback(memberList)
    }
  })

  channel.bind('pusher:member_added', (member: { id: string; info: { name: string; image: string | null; color: string } }) => {
    const current = presenceMembers.get(channelId) || []
    const updated = [...current, { id: member.id, info: member.info }]
    presenceMembers.set(channelId, updated)
    if (presenceCallback && channelId === currentPresenceChannelId) {
      presenceCallback(updated)
    }
  })

  channel.bind('pusher:member_removed', (member: { id: string }) => {
    const current = presenceMembers.get(channelId) || []
    const updated = current.filter((m) => m.id !== member.id)
    presenceMembers.set(channelId, updated)
    // Also remove their cursor
    const cursors = cursorPositions.get(channelId)
    if (cursors) {
      cursors.delete(member.id)
      if (cursorCallback && channelId === currentPresenceChannelId) {
        cursorCallback(cursors)
      }
    }
    if (presenceCallback && channelId === currentPresenceChannelId) {
      presenceCallback(updated)
    }
  })

  // Listen for cursor updates from other users
  channel.bind('client-cursor-update', (data: { userId: string; x: number; y: number; timestamp: number }) => {
    // Ignore own cursor updates
    if (data.userId === myPresenceUserId) {
      return
    }

    const cursors = cursorPositions.get(channelId)
    const members = presenceMembers.get(channelId) || []
    const user = members.find((m) => m.id === data.userId)

    if (cursors && user) {
      cursors.set(data.userId, {
        x: data.x,
        y: data.y,
        userId: data.userId,
        user,
        timestamp: data.timestamp,
      })

      if (cursorCallback && channelId === currentPresenceChannelId) {
        cursorCallback(cursors)
      }
    }
  })

  channel.bind('pusher:subscription_error', (err: unknown) => {
    console.error(`[Pusher Client] Failed to subscribe to presence channel ${channelId}:`, err)
  })

  presenceSubscriptions.set(channelId, channel)
  currentPresenceChannelId = channelId
}

/**
 * Unsubscribe from a channel's presence.
 */
export function unsubscribeFromPresence(channelId: string): void {
  if (!pusherInstance) {
    return
  }

  const presenceChannelName = `presence-channel-${channelId}`

  if (presenceSubscriptions.has(channelId)) {
    pusherInstance.unsubscribe(presenceChannelName)
    presenceSubscriptions.delete(channelId)
    presenceMembers.delete(channelId)
    cursorPositions.delete(channelId)
  }

  if (currentPresenceChannelId === channelId) {
    currentPresenceChannelId = null
  }
}

/**
 * Send cursor position update to other users.
 */
export function sendCursorUpdate(x: number, y: number): void {
  if (!pusherInstance || !currentPresenceChannelId || !myPresenceUserId) {
    return
  }

  const channel = presenceSubscriptions.get(currentPresenceChannelId)
  if (!channel) {
    return
  }

  // Use client events (must be enabled in Pusher dashboard)
  channel.trigger('client-cursor-update', {
    userId: myPresenceUserId,
    x,
    y,
    timestamp: Date.now(),
  })
}

/**
 * Get current presence members for a channel.
 */
export function getPresenceMembers(channelId: string): PresenceUser[] {
  return presenceMembers.get(channelId) || []
}

/**
 * Get current cursor positions for a channel.
 */
export function getCursorPositions(channelId: string): Map<string, CursorPosition> {
  return cursorPositions.get(channelId) || new Map()
}

/**
 * Get the current presence channel ID.
 */
export function getCurrentPresenceChannelId(): string | null {
  return currentPresenceChannelId
}

/**
 * Set the current presence channel ID (for switching views).
 */
export function setCurrentPresenceChannelId(channelId: string | null): void {
  currentPresenceChannelId = channelId
}
