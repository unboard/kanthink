/**
 * Sync layer that wraps store mutations with server API calls.
 * Uses fire-and-forget pattern - optimistic UI updates happen immediately,
 * server sync happens in background.
 */

import * as api from './client'

// Track if we're in server mode (authenticated)
let serverModeEnabled = false

export function enableServerMode() {
  serverModeEnabled = true
}

export function disableServerMode() {
  serverModeEnabled = false
}

export function isServerMode() {
  return serverModeEnabled
}

// Helper to run sync in background with retry logic
function syncInBackground(fn: () => Promise<void>, label?: string) {
  if (!serverModeEnabled) {
    console.warn(`[Sync] Skipping ${label || 'sync'} - server mode not enabled`)
    return
  }

  const attempt = async (retries: number, delay: number) => {
    try {
      await fn()
    } catch (err) {
      if (retries > 0) {
        console.warn(`[Sync] ${label || 'Background sync'} failed, retrying in ${delay}ms (${retries} left)`)
        await new Promise(r => setTimeout(r, delay))
        return attempt(retries - 1, delay * 2)
      }
      console.error(`[Sync] ${label || 'Background sync'} failed after all retries:`, err)
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
  })
}

export function syncChannelDelete(channelId: string) {
  syncInBackground(async () => {
    await api.deleteChannel(channelId)
  })
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
  })
}

export function syncCardUpdate(channelId: string, cardId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateCard(channelId, cardId, updates)
  })
}

export function syncCardDelete(channelId: string, cardId: string) {
  syncInBackground(async () => {
    await api.deleteCard(channelId, cardId)
  })
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
  })
}

// ===== COLUMN SYNC =====

export function syncColumnCreate(channelId: string, columnId: string, name: string) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createColumn(channelId, name, columnId)
  })
}

export function syncColumnUpdate(channelId: string, columnId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateColumn(channelId, columnId, updates)
  })
}

export function syncColumnDelete(channelId: string, columnId: string) {
  syncInBackground(async () => {
    await api.deleteColumn(channelId, columnId)
  })
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
  })
}

export function syncFolderUpdate(folderId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateFolder(folderId, updates)
  })
}

export function syncFolderDelete(folderId: string) {
  syncInBackground(async () => {
    await api.deleteFolder(folderId)
  })
}

// ===== ORGANIZATION SYNC =====

export function syncMoveChannelToFolder(channelId: string, folderId: string | null) {
  syncInBackground(async () => {
    await api.moveChannelToFolder(channelId, folderId)
  })
}

export function syncReorderChannelInFolder(
  channelId: string,
  folderId: string | null,
  fromIndex: number,
  toIndex: number
) {
  syncInBackground(async () => {
    await api.reorderChannelInFolder(channelId, folderId, fromIndex, toIndex)
  })
}

export function syncReorderFolders(folderId: string, fromIndex: number, toIndex: number) {
  syncInBackground(async () => {
    await api.reorderFolders(folderId, fromIndex, toIndex)
  })
}

// ===== TASK SYNC =====

export function syncTaskCreate(
  channelId: string,
  taskId: string,
  data: { cardId?: string; title: string; description?: string; status?: 'not_started' | 'in_progress' | 'done'; position?: number; createdAt?: string }
) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createTask(channelId, { ...data, id: taskId })
  })
}

export function syncTaskUpdate(channelId: string, taskId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateTask(channelId, taskId, updates)
  })
}

export function syncTaskDelete(channelId: string, taskId: string) {
  syncInBackground(async () => {
    await api.deleteTask(channelId, taskId)
  })
}

export function syncTaskReorder(channelId: string, taskId: string, cardId: string | null, toPosition: number) {
  syncInBackground(async () => {
    await api.reorderTasks(channelId, taskId, cardId, toPosition)
  })
}

// ===== INSTRUCTION CARD SYNC =====

export function syncInstructionCardCreate(channelId: string, instructionId: string, data: Record<string, unknown>) {
  syncInBackground(async () => {
    // Pass the client-generated ID so server uses the same ID
    await api.createInstructionCard(channelId, { ...data, id: instructionId })
  })
}

export function syncInstructionCardUpdate(channelId: string, instructionId: string, updates: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.updateInstructionCard(channelId, instructionId, updates)
  })
}

export function syncInstructionCardDelete(channelId: string, instructionId: string) {
  syncInBackground(async () => {
    await api.deleteInstructionCard(channelId, instructionId)
  })
}
