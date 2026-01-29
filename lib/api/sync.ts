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

// Helper to run sync in background without blocking UI
function syncInBackground(fn: () => Promise<void>) {
  if (!serverModeEnabled) return

  fn().catch((err) => {
    console.error('Background sync failed:', err)
    // TODO: Could add retry logic or show toast notification
  })
}

// ===== CHANNEL SYNC =====

export function syncChannelCreate(channelId: string, data: Parameters<typeof api.createChannel>[0]) {
  syncInBackground(async () => {
    await api.createChannel(data)
  })
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
  data: { columnId: string; title: string; initialMessage?: string; source?: 'manual' | 'ai'; position?: number }
) {
  syncInBackground(async () => {
    await api.createCard(channelId, data)
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
    await api.createColumn(channelId, name)
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

// ===== FOLDER SYNC =====

export function syncFolderCreate(folderId: string, name: string) {
  syncInBackground(async () => {
    await api.createFolder(name)
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
  data: { cardId?: string; title: string; description?: string; status?: 'not_started' | 'in_progress' | 'done'; position?: number }
) {
  syncInBackground(async () => {
    await api.createTask(channelId, data)
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

export function syncInstructionCardCreate(channelId: string, data: Record<string, unknown>) {
  syncInBackground(async () => {
    await api.createInstructionCard(channelId, data)
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
