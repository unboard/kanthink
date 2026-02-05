/**
 * Cross-tab synchronization using BroadcastChannel API.
 *
 * When any Zustand store mutation happens, we broadcast the event to other tabs.
 * Other tabs receive and apply the same mutation, keeping all tabs in sync.
 *
 * Also handles cross-device sync via Pusher when in server mode.
 */

import type { ID, Channel, Card, Task, InstructionCard, Folder, Column, CardMessage, CardProperty, StoredAction, PropertyDefinition, TagDefinition, ChannelQuestion, SuggestionMode, InstructionRun } from '../types'
import { isServerMode } from '../api/sync'

const CHANNEL_NAME = 'kanthink-sync'

// Event types for all store mutations
export type BroadcastEvent =
  // Folder events
  | { type: 'folder:create'; folder: Folder }
  | { type: 'folder:update'; id: ID; updates: Partial<Folder> }
  | { type: 'folder:delete'; id: ID; channelIds: ID[] }
  | { type: 'folder:reorder'; fromIndex: number; toIndex: number }
  | { type: 'folder:toggleCollapse'; id: ID; isCollapsed: boolean }

  // Channel organization events
  | { type: 'channel:moveToFolder'; channelId: ID; folderId: ID | null }
  | { type: 'channel:reorderInFolder'; folderId: ID; fromIndex: number; toIndex: number }
  | { type: 'channel:reorder'; fromIndex: number; toIndex: number }

  // Channel events
  | { type: 'channel:create'; channel: Channel }
  | { type: 'channel:update'; id: ID; updates: Partial<Channel> }
  | { type: 'channel:delete'; id: ID }

  // Column events
  | { type: 'column:create'; channelId: ID; column: Column }
  | { type: 'column:update'; channelId: ID; columnId: ID; updates: Partial<Column> }
  | { type: 'column:delete'; channelId: ID; columnId: ID }
  | { type: 'column:reorder'; channelId: ID; fromIndex: number; toIndex: number }

  // Card events
  | { type: 'card:create'; card: Card; columnId: ID; position: number }
  | { type: 'card:update'; id: ID; updates: Partial<Card> }
  | { type: 'card:delete'; id: ID; channelId: ID; columnId: ID }
  | { type: 'card:deleteAllInColumn'; channelId: ID; columnId: ID; cardIds: ID[] }
  | { type: 'card:move'; cardId: ID; channelId: ID; fromColumnId: ID; toColumnId: ID; toIndex: number }
  | { type: 'card:archive'; cardId: ID; channelId: ID; columnId: ID }
  | { type: 'card:unarchive'; cardId: ID; channelId: ID; columnId: ID }

  // Card message events
  | { type: 'card:addMessage'; cardId: ID; message: CardMessage }
  | { type: 'card:addAIResponse'; cardId: ID; questionId: ID; message: CardMessage }
  | { type: 'card:updateMessageAction'; cardId: ID; messageId: ID; actionId: string; updates: Partial<StoredAction> }
  | { type: 'card:editMessage'; cardId: ID; messageId: ID; content: string }
  | { type: 'card:deleteMessage'; cardId: ID; messageId: ID }
  | { type: 'card:setSummary'; cardId: ID; summary: string }
  | { type: 'card:setCoverImage'; cardId: ID; url: string | null }

  // Task events
  | { type: 'task:create'; task: Task; cardId: ID | null }
  | { type: 'task:update'; id: ID; updates: Partial<Task> }
  | { type: 'task:delete'; id: ID; cardId: ID | null; channelId: ID }
  | { type: 'task:complete'; id: ID; completedAt: string }
  | { type: 'task:toggleStatus'; id: ID; status: string; completedAt: string | undefined }
  | { type: 'task:reorder'; cardId: ID; fromIndex: number; toIndex: number }
  | { type: 'task:reorderUnlinked'; channelId: ID; fromIndex: number; toIndex: number }

  // Property events
  | { type: 'property:addDefinition'; channelId: ID; definition: PropertyDefinition }
  | { type: 'property:removeDefinition'; channelId: ID; propertyId: ID }
  | { type: 'card:setProperty'; cardId: ID; property: CardProperty }
  | { type: 'card:removeProperty'; cardId: ID; key: string }
  | { type: 'card:setProperties'; cardId: ID; properties: CardProperty[] }
  | { type: 'card:recordInstructionRun'; cardId: ID; instructionId: ID }
  | { type: 'card:clearInstructionRun'; cardId: ID; instructionId: ID }

  // Tag events
  | { type: 'tag:addDefinition'; channelId: ID; tag: TagDefinition }
  | { type: 'tag:updateDefinition'; channelId: ID; tagId: ID; updates: { name?: string; color?: string } }
  | { type: 'tag:removeDefinition'; channelId: ID; tagId: ID }
  | { type: 'card:addTag'; cardId: ID; tagName: string }
  | { type: 'card:removeTag'; cardId: ID; tagName: string }

  // Question events
  | { type: 'question:add'; channelId: ID; question: ChannelQuestion }
  | { type: 'question:answer'; channelId: ID; questionId: ID; answer: string }
  | { type: 'question:dismiss'; channelId: ID; questionId: ID }

  // Instruction history events
  | { type: 'instruction:addRevision'; channelId: ID; revision: { id: ID; instructions: string; source: string; timestamp: string } }
  | { type: 'instruction:rollback'; channelId: ID; revisionId: ID; instructions: string }
  | { type: 'instruction:setSuggestionMode'; channelId: ID; mode: SuggestionMode }

  // Instruction card events
  | { type: 'instructionCard:create'; instructionCard: InstructionCard }
  | { type: 'instructionCard:update'; id: ID; updates: Partial<InstructionCard> }
  | { type: 'instructionCard:delete'; id: ID; channelId: ID }
  | { type: 'instructionCard:reorder'; channelId: ID; fromIndex: number; toIndex: number }

  // Instruction run events
  | { type: 'instructionRun:save'; run: InstructionRun }
  | { type: 'instructionRun:undo'; runId: ID }

  // Server sync events
  | { type: 'server:load'; timestamp: string }
  | { type: 'server:clear' }

// Wrapper message with metadata
interface BroadcastMessage {
  event: BroadcastEvent
  eventId: string
  senderId: string
  timestamp: number
}

// Cache of recently processed event IDs for deduplication
const processedEventIds = new Set<string>()
const MAX_PROCESSED_CACHE = 1000

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Check if an event has already been processed (for deduplication).
 * Returns true if this is a duplicate event.
 */
export function isDuplicateEvent(eventId: string): boolean {
  if (processedEventIds.has(eventId)) {
    return true
  }

  // Add to cache
  processedEventIds.add(eventId)

  // Trim cache if too large
  if (processedEventIds.size > MAX_PROCESSED_CACHE) {
    const iterator = processedEventIds.values()
    for (let i = 0; i < 100; i++) {
      const oldest = iterator.next().value
      if (oldest) processedEventIds.delete(oldest)
    }
  }

  return false
}

/**
 * Mark an event ID as processed (called when we originate the event).
 */
export function markEventProcessed(eventId: string): void {
  processedEventIds.add(eventId)

  // Trim cache if too large
  if (processedEventIds.size > MAX_PROCESSED_CACHE) {
    const iterator = processedEventIds.values()
    for (let i = 0; i < 100; i++) {
      const oldest = iterator.next().value
      if (oldest) processedEventIds.delete(oldest)
    }
  }
}

// Generate a unique ID for this tab/client
// Exported so Pusher can use the same ID to prevent echo
export const clientId = typeof crypto !== 'undefined'
  ? crypto.randomUUID()
  : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

// Keep tabId as an alias for backwards compatibility
const tabId = clientId

// Singleton channel instance
let channel: BroadcastChannel | null = null

// Flag to prevent re-broadcasting received events
let isApplyingRemoteEvent = false

// Listener callback
type EventListener = (event: BroadcastEvent) => void
let listener: EventListener | null = null

/**
 * Initialize the broadcast channel and start listening for events.
 */
export function initBroadcastSync(onEvent: EventListener): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    // SSR or unsupported browser - return no-op cleanup
    return () => {}
  }

  // Close existing channel if any
  if (channel) {
    channel.close()
  }

  channel = new BroadcastChannel(CHANNEL_NAME)
  listener = onEvent

  channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
    const { event: syncEvent, eventId, senderId } = event.data

    // Ignore events from this tab
    if (senderId === tabId) {
      return
    }

    // Check for duplicate (may have received via Pusher already)
    if (eventId && isDuplicateEvent(eventId)) {
      return
    }

    // Apply the event
    if (listener) {
      isApplyingRemoteEvent = true
      try {
        listener(syncEvent)
      } finally {
        isApplyingRemoteEvent = false
      }
    }
  }

  // Return cleanup function
  return () => {
    if (channel) {
      channel.close()
      channel = null
    }
    listener = null
  }
}

/**
 * Broadcast an event to other tabs.
 * Will not broadcast if we're currently applying a remote event (prevents loops).
 * Returns the event ID for use in Pusher publish.
 */
export function broadcastEvent(event: BroadcastEvent, eventId?: string): string {
  const id = eventId || generateEventId()

  // Don't broadcast if we're applying a remote event
  if (isApplyingRemoteEvent) {
    return id
  }

  // Mark this event as processed so we don't apply it again from Pusher
  markEventProcessed(id)

  // Don't broadcast in SSR or unsupported browsers
  if (typeof window === 'undefined' || !channel) {
    return id
  }

  const message: BroadcastMessage = {
    event,
    eventId: id,
    senderId: tabId,
    timestamp: Date.now(),
  }

  try {
    channel.postMessage(message)
  } catch (error) {
    console.error('Failed to broadcast event:', error)
  }

  return id
}

/**
 * Check if we're currently applying a remote event.
 * Used by store mutations to avoid triggering server sync for remote events.
 */
export function isRemoteEvent(): boolean {
  return isApplyingRemoteEvent
}

/**
 * Get the current tab ID (useful for debugging).
 */
export function getTabId(): string {
  return tabId
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
  'channel:create', // User needs to see new channels on other devices
])

/**
 * Extract the channelId from an event, if applicable.
 */
function getChannelIdFromEvent(event: BroadcastEvent): string | null {
  // Check if event has a channelId directly
  if ('channelId' in event && event.channelId) {
    return event.channelId as string
  }

  // Check for channel in event object
  if (event.type === 'channel:create' && 'channel' in event) {
    return (event as { channel: { id: string } }).channel.id
  }
  if (event.type === 'channel:update' || event.type === 'channel:delete') {
    return (event as { id: string }).id
  }

  // Check for card with channelId
  if (event.type === 'card:create' && 'card' in event) {
    return (event as { card: { channelId: string } }).card.channelId
  }

  // Check for instruction card with channelId
  if (event.type === 'instructionCard:create' && 'instructionCard' in event) {
    return (event as { instructionCard: { channelId: string } }).instructionCard.channelId
  }

  // Check for task with channelId
  if (event.type === 'task:create' && 'task' in event) {
    return (event as { task: { channelId: string } }).task.channelId
  }

  // Check for instruction run with channelId
  if (event.type === 'instructionRun:save' && 'run' in event) {
    return (event as { run: { channelId: string } }).run.channelId
  }

  // Lazy import to avoid circular dependency - only load once
  let store: { cards: Record<string, { channelId: string }>; tasks: Record<string, { channelId: string }> } | null = null
  try {
    const { useStore } = require('../store')
    store = useStore.getState()
  } catch {
    // Store not available yet
  }

  if (!store) return null

  // For any event with a cardId, look up the card's channelId from the store
  if ('cardId' in event && event.cardId) {
    const card = store.cards[event.cardId as string]
    if (card) return card.channelId
  }

  // For any event with a task id, look up the task's channelId from the store
  if ('id' in event && event.type.startsWith('task:')) {
    const task = store.tasks[event.id as string]
    if (task) return task.channelId
  }

  return null
}

/**
 * Broadcast an event to both local tabs (BroadcastChannel) and cross-device (Pusher).
 * This is the main function to use for syncing store mutations.
 */
export function broadcastAndPublish(event: BroadcastEvent): void {
  const eventId = broadcastEvent(event)
  publishToPusher(event, eventId)
}

/**
 * Publish an event to Pusher for cross-device sync.
 * Fire-and-forget - doesn't block on response.
 */
export function publishToPusher(event: BroadcastEvent, eventId?: string): void {
  // Don't publish if we're applying a remote event
  if (isApplyingRemoteEvent) {
    return
  }

  // Only publish in server mode (authenticated)
  if (!isServerMode()) {
    return
  }

  // Don't publish in SSR
  if (typeof window === 'undefined') {
    return
  }

  // Determine if this is a user-scoped event
  const isUserScoped = USER_SCOPED_EVENTS.has(event.type)

  // For channel-scoped events, get the channelId
  const channelId = isUserScoped ? undefined : getChannelIdFromEvent(event)

  // If it's not user-scoped and we couldn't find a channelId, skip
  if (!isUserScoped && !channelId) {
    return
  }

  // Fire-and-forget POST to broadcast endpoint
  fetch('/api/sync/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      eventId: eventId || generateEventId(),
      channelId,
      senderId: clientId,
    }),
  }).catch((error) => {
    // Silently fail - this is fire-and-forget
    console.warn('[Pusher] Failed to publish event:', error)
  })
}
