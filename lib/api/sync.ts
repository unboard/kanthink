/**
 * Sync layer that wraps store mutations with server API calls.
 * Uses fire-and-forget pattern - optimistic UI updates happen immediately,
 * server sync happens in background with retry and user notification on failure.
 */

import * as api from './client'
import { useToastStore } from '@/lib/toastStore'

// Track if we're in server mode (authenticated)
let serverModeEnabled = false

// Track pending syncs to warn before page unload
let pendingSyncCount = 0

export function enableServerMode() {
  serverModeEnabled = true
}

export function disableServerMode() {
  serverModeEnabled = false
}

export function isServerMode() {
  return serverModeEnabled
}

export function hasPendingSyncs() {
  return pendingSyncCount > 0
}

// Warn user before closing tab if syncs are pending
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingSyncCount > 0) {
      e.preventDefault()
    }
  })
}

// Helper to run sync in background with retry logic
function syncInBackground(fn: () => Promise<void>, label?: string) {
  if (!serverModeEnabled) {
    console.warn(`[Sync] Skipping ${label || 'sync'} - server mode not enabled`)
    return
  }

  pendingSyncCount++

  const attempt = async (retries: number, delay: number) => {
    try {
      await fn()
      pendingSyncCount--
    } catch (err) {
      if (retries > 0) {
        console.warn(`[Sync] ${label || 'Background sync'} failed, retrying in ${delay}ms (${retries} left)`)
        await new Promise(r => setTimeout(r, delay))
        return attempt(retries - 1, delay * 2)
      }
      pendingSyncCount--
      console.error(`[Sync] ${label || 'Background sync'} failed after all retries:`, err)

      // Show error toast with retry action
      const friendlyLabel = label || 'save'
      useToastStore.getState().addToast(
        `Failed to ${friendlyLabel} — changes may be lost. Check your connection.`,
        'error',
        0, // Don't auto-dismiss errors
        {
          label: 'Retry',
          onClick: () => syncInBackground(fn, label),
        }
      )
    }
  }

  attempt(3, 1000)
}

// ===== CHANNEL SYNC =====

export function syncChannelCreate(channelId: string, data: Parameters<typeof api.createChannel>[0]) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createChannel({ ...data, id: channelId })
  }, `channelCreate:${channelId}`)
}

export function syncChannelUpdate(channelId: string, updates: Parameters<typeof api.updateChannel>[1]) {
  syncInBackground(async () => {
    await api.updateChannel(channelId, updates)
  }, 'update channel')
}

export function syncChannelDelete(channelId: string) {
  syncInBackground(async () => {
    await api.deleteChannel(channelId)
  }, 'delete channel')
}

// ===== CARD SYNC =====

export function syncCardCreate(
  channelId: string,
  cardId: string,
  data: { columnId: string; title: string; initialMessage?: string; source?: 'manual' | 'ai'; position?: number }
) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createCard(channelId, { ...data, id: cardId })
  }, 'save card')
}

export function syncCardUpdate(channelId: string, cardId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateCard(channelId, cardId, updates)
  }, 'update card')
}

export function syncCardDelete(channelId: string, cardId: string) {
  syncInBackground(async () => {
    await api.deleteCard(channelId, cardId)
  }, 'delete card')
}

export function syncCardMove(
  channelId: string,
  cardId: string,
  toColumnId: string,
  toPosition: number,
  isArchived = false
) {
  syncInBackground(async () => {
    await api.moveCard(channelId, cardId, toColumnId, toPosition, isArchived)
  }, 'move card')
}

// ===== COLUMN SYNC =====

export function syncColumnCreate(channelId: string, columnId: string, name: string) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createColumn(channelId, name, columnId)
  }, 'save column')
}

export function syncColumnUpdate(channelId: string, columnId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateColumn(channelId, columnId, updates)
  }, 'update column')
}

export function syncColumnDelete(channelId: string, columnId: string) {
  syncInBackground(async () => {
    await api.deleteColumn(channelId, columnId)
  }, 'delete column')
}

export function syncColumnReorder(channelId: string, columnId: string, toPosition: number) {
  syncInBackground(async () => {
    await api.reorderColumns(channelId, columnId, toPosition)
  })
}

// ===== FOLDER SYNC =====

export function syncFolderCreate(folderId: string, name: string) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createFolder(name, folderId)
  }, 'save folder')
}

export function syncFolderUpdate(folderId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateFolder(folderId, updates)
  }, 'update folder')
}

export function syncFolderDelete(folderId: string) {
  syncInBackground(async () => {
    await api.deleteFolder(folderId)
  }, 'delete folder')
}

// ===== ORGANIZATION SYNC =====

export function syncMoveChannelToFolder(channelId: string, folderId: string | null) {
  syncInBackground(async () => {
    await api.moveChannelToFolder(channelId, folderId)
  }, 'move channel')
}

export function syncReorderChannelInFolder(
  channelId: string,
  folderId: string | null,
  fromIndex: number,
  toIndex: number
) {
  syncInBackground(async () => {
    await api.reorderChannelInFolder(channelId, folderId, fromIndex, toIndex)
  }, 'reorder channels')
}

export function syncReorderFolders(folderId: string, fromIndex: number, toIndex: number) {
  syncInBackground(async () => {
    await api.reorderFolders(folderId, fromIndex, toIndex)
  }, 'reorder folders')
}

// ===== CARD ORDER SYNC =====

export function syncColumnCardOrder(channelId: string, columnId: string, cardIds: string[]) {
  syncInBackground(async () => {
    await api.sortColumnCards(channelId, columnId, cardIds)
  }, `columnCardOrder:${columnId}`)
}

// ===== TASK SYNC =====

export function syncTaskCreate(
  channelId: string,
  taskId: string,
  data: { cardId?: string; columnId?: string; title: string; description?: string; status?: 'not_started' | 'in_progress' | 'done'; position?: number; dueDate?: string; createdAt?: string; createdBy?: string }
) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createTask(channelId, { ...data, id: taskId })
  }, 'save task')
}

export function syncTaskUpdate(channelId: string, taskId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateTask(channelId, taskId, updates)
  }, 'update task')
}

export function syncTaskDelete(channelId: string, taskId: string) {
  syncInBackground(async () => {
    await api.deleteTask(channelId, taskId)
  }, 'delete task')
}

export function syncTaskReorder(channelId: string, taskId: string, cardId: string | null, toPosition: number) {
  syncInBackground(async () => {
    await api.reorderTasks(channelId, taskId, cardId, toPosition)
  }, 'reorder tasks')
}

// ===== INSTRUCTION CARD SYNC =====

export function syncInstructionCardCreate(channelId: string, instructionId: string, data: Record<string, unknown>) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createInstructionCard(channelId, { ...data, id: instructionId })
  }, 'save shroom')
}

export function syncInstructionCardUpdate(channelId: string, instructionId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateInstructionCard(channelId, instructionId, updates)
  }, 'update shroom')
}

export function syncInstructionCardDelete(channelId: string, instructionId: string) {
  syncInBackground(async () => {
    await api.deleteInstructionCard(channelId, instructionId)
  }, 'delete shroom')
}
