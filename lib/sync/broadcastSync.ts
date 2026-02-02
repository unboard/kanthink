/**
 * Cross-tab synchronization using BroadcastChannel API.
 *
 * When any Zustand store mutation happens, we broadcast the event to other tabs.
 * Other tabs receive and apply the same mutation, keeping all tabs in sync.
 */

import type { ID, Channel, Card, Task, InstructionCard, Folder, Column, CardMessage, CardProperty, StoredAction, PropertyDefinition, TagDefinition, ChannelQuestion, SuggestionMode, InstructionRun } from '../types'

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
  senderId: string
  timestamp: number
}

// Generate a unique ID for this tab
const tabId = typeof crypto !== 'undefined'
  ? crypto.randomUUID()
  : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

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
    const { event: syncEvent, senderId } = event.data

    // Ignore events from this tab
    if (senderId === tabId) {
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
 */
export function broadcastEvent(event: BroadcastEvent): void {
  // Don't broadcast if we're applying a remote event
  if (isApplyingRemoteEvent) {
    return
  }

  // Don't broadcast in SSR or unsupported browsers
  if (typeof window === 'undefined' || !channel) {
    return
  }

  const message: BroadcastMessage = {
    event,
    senderId: tabId,
    timestamp: Date.now(),
  }

  try {
    channel.postMessage(message)
  } catch (error) {
    console.error('Failed to broadcast event:', error)
  }
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
