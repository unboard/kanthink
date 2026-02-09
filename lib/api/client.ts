/**
 * API client for server-side channel operations.
 * These functions call the server APIs and return typed responses.
 */

import type {
  Channel,
  Card,
  Column,
  Task,
  InstructionCard,
  Folder,
  CardInput,
  ChannelInput,
} from '@/lib/types'

// Response types
interface ChannelListResponse {
  channels: Array<Channel & { role: 'owner' | 'editor' | 'viewer' }>
  organization: Array<{ channelId: string; folderId: string | null; position: number }>
}

interface ChannelDetailResponse {
  channel: Channel & { role: 'owner' | 'editor' | 'viewer' }
  columns: Column[]
  cards: Card[]
  tasks: Task[]
  instructionCards: InstructionCard[]
}

interface FoldersResponse {
  folders: Array<Folder & { channelIds: string[] }>
  rootChannelIds: string[]
}

// ===== CHANNELS =====

export async function fetchChannels(): Promise<ChannelListResponse> {
  const res = await fetch('/api/channels', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch channels')
  }
  return res.json()
}

export async function fetchChannel(channelId: string): Promise<ChannelDetailResponse> {
  const res = await fetch(`/api/channels/${channelId}`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch channel')
  }
  return res.json()
}

export async function createChannel(input: ChannelInput & { id?: string; columnNames?: string[]; columns?: Array<{ id: string; name: string; isAiTarget?: boolean }> }): Promise<{ channel: Channel; columns: Column[] }> {
  const res = await fetch('/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error('Failed to create channel')
  }
  return res.json()
}

export async function updateChannel(channelId: string, updates: Partial<Channel>): Promise<{ channel: Channel }> {
  const res = await fetch(`/api/channels/${channelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update channel')
  }
  return res.json()
}

export async function deleteChannel(channelId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete channel')
  }
}

// ===== CARDS =====

export async function createCard(
  channelId: string,
  input: { id?: string; columnId: string; title: string; initialMessage?: string; source?: 'manual' | 'ai'; position?: number }
): Promise<{ card: Card }> {
  const res = await fetch(`/api/channels/${channelId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error('Failed to create card')
  }
  return res.json()
}

export async function updateCard(channelId: string, cardId: string, updates: Partial<Card>): Promise<{ card: Card }> {
  const res = await fetch(`/api/channels/${channelId}/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update card')
  }
  return res.json()
}

export async function deleteCard(channelId: string, cardId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/cards/${cardId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete card')
  }
}

export async function moveCard(
  channelId: string,
  cardId: string,
  toColumnId: string,
  toPosition: number,
  isArchived = false
): Promise<{ card: Card }> {
  const res = await fetch(`/api/channels/${channelId}/cards/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, toColumnId, toPosition, isArchived }),
  })
  if (!res.ok) {
    throw new Error('Failed to move card')
  }
  return res.json()
}

// ===== COLUMNS =====

export async function createColumn(channelId: string, name: string, id?: string): Promise<{ column: Column }> {
  const res = await fetch(`/api/channels/${channelId}/columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name }),
  })
  if (!res.ok) {
    throw new Error('Failed to create column')
  }
  return res.json()
}

export async function updateColumn(channelId: string, columnId: string, updates: Partial<Column>): Promise<{ column: Column }> {
  const res = await fetch(`/api/channels/${channelId}/columns/${columnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update column')
  }
  return res.json()
}

export async function deleteColumn(channelId: string, columnId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/columns/${columnId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete column')
  }
}

export async function reorderColumns(channelId: string, columnId: string, toPosition: number): Promise<{ columns: Column[] }> {
  const res = await fetch(`/api/channels/${channelId}/columns/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId, toPosition }),
  })
  if (!res.ok) {
    throw new Error('Failed to reorder columns')
  }
  return res.json()
}

// ===== FOLDERS =====

export async function fetchFolders(): Promise<FoldersResponse> {
  const res = await fetch('/api/folders', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch folders')
  }
  return res.json()
}

export async function createFolder(name: string, id?: string): Promise<{ folder: Folder }> {
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name }),
  })
  if (!res.ok) {
    throw new Error('Failed to create folder')
  }
  return res.json()
}

export async function updateFolder(folderId: string, updates: Partial<Folder>): Promise<{ folder: Folder }> {
  const res = await fetch(`/api/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update folder')
  }
  return res.json()
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetch(`/api/folders/${folderId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete folder')
  }
}

// ===== ORGANIZATION =====

export async function moveChannelToFolder(channelId: string, targetFolderId: string | null): Promise<void> {
  const res = await fetch('/api/organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'moveChannelToFolder', channelId, targetFolderId }),
  })
  if (!res.ok) {
    throw new Error('Failed to move channel')
  }
}

export async function reorderChannelInFolder(
  channelId: string,
  folderId: string | null,
  fromIndex: number,
  toIndex: number
): Promise<void> {
  const res = await fetch('/api/organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'reorderChannelInFolder', channelId, folderId, fromIndex, toIndex }),
  })
  if (!res.ok) {
    throw new Error('Failed to reorder channel')
  }
}

export async function reorderFolders(folderId: string, fromIndex: number, toIndex: number): Promise<void> {
  const res = await fetch('/api/organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'reorderFolders', folderId, fromIndex, toIndex }),
  })
  if (!res.ok) {
    throw new Error('Failed to reorder folders')
  }
}

// ===== SHARING =====

export type ChannelRole = 'owner' | 'editor' | 'viewer'

export interface ChannelShare {
  id: string
  channelId: string
  userId: string | null
  email: string
  role: ChannelRole
  roleDescription?: string | null
  invitedBy: string
  invitedAt: string
  acceptedAt: string | null
  user?: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

export interface InviteLink {
  id: string
  channelId: string
  token: string
  defaultRole: 'editor' | 'viewer'
  requiresApproval: boolean
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  createdAt: string
}

export interface SharesResponse {
  currentUserRole: ChannelRole
  canManage: boolean
  owner: {
    id: string
    name: string | null
    email: string
    image: string | null
    role: 'owner'
  } | null
  shares: ChannelShare[]
}

export async function fetchShares(channelId: string): Promise<SharesResponse> {
  const res = await fetch(`/api/channels/${channelId}/shares`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch shares')
  }
  return res.json()
}

export async function createShare(
  channelId: string,
  email: string,
  role: ChannelRole
): Promise<{ share: ChannelShare }> {
  const res = await fetch(`/api/channels/${channelId}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create share')
  }
  return res.json()
}

export async function updateShare(
  channelId: string,
  shareId: string,
  updates: { role?: ChannelRole; roleDescription?: string | null }
): Promise<{ share: ChannelShare }> {
  const res = await fetch(`/api/channels/${channelId}/shares/${shareId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update share')
  }
  return res.json()
}

export async function deleteShare(channelId: string, shareId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/shares/${shareId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete share')
  }
}

export async function fetchInviteLinks(channelId: string): Promise<{ links: InviteLink[] }> {
  const res = await fetch(`/api/channels/${channelId}/invite-links`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch invite links')
  }
  return res.json()
}

export async function createInviteLink(
  channelId: string,
  options?: { defaultRole?: 'editor' | 'viewer'; expiresInDays?: number; maxUses?: number }
): Promise<{ link: InviteLink; url: string }> {
  const res = await fetch(`/api/channels/${channelId}/invite-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  if (!res.ok) {
    throw new Error('Failed to create invite link')
  }
  return res.json()
}

export async function deleteInviteLink(channelId: string, linkId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/invite-links/${linkId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete invite link')
  }
}

// ===== MEMBERS =====

export async function fetchChannelMembers(channelId: string): Promise<{ members: Array<{ id: string; name: string; email: string; image: string | null; role?: string; roleDescription?: string | null }> }> {
  const res = await fetch(`/api/channels/${channelId}/members`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error('Failed to fetch channel members')
  }
  return res.json()
}

// ===== TASKS =====

export async function createTask(
  channelId: string,
  input: { id?: string; cardId?: string; title: string; description?: string; status?: 'not_started' | 'in_progress' | 'done'; position?: number; createdAt?: string }
): Promise<{ task: Task }> {
  const res = await fetch(`/api/channels/${channelId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error('Failed to create task')
  }
  return res.json()
}

export async function updateTask(channelId: string, taskId: string, updates: Partial<Task>): Promise<{ task: Task }> {
  const res = await fetch(`/api/channels/${channelId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new Error('Failed to update task')
  }
  return res.json()
}

export async function deleteTask(channelId: string, taskId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/tasks/${taskId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete task')
  }
}

export async function reorderTasks(channelId: string, taskId: string, cardId: string | null, toPosition: number): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/tasks/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, cardId, toPosition }),
  })
  if (!res.ok) {
    throw new Error('Failed to reorder tasks')
  }
}

// ===== INSTRUCTION CARDS =====

export async function createInstructionCard(
  channelId: string,
  input: Partial<InstructionCard>
): Promise<{ instructionCard: InstructionCard }> {
  const res = await fetch(`/api/channels/${channelId}/instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw new Error('Failed to create instruction card')
  }
  return res.json()
}

export async function updateInstructionCard(
  channelId: string,
  instructionId: string,
  updates: Partial<InstructionCard>
): Promise<{ instructionCard: InstructionCard }> {
  const res = await fetch(`/api/channels/${channelId}/instructions/${instructionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const errorMsg = errorData.error || `HTTP ${res.status}`
    console.error(`Failed to update instruction card: ${errorMsg}`, { channelId, instructionId, updates })
    throw new Error(`Failed to update instruction card: ${errorMsg}`)
  }
  return res.json()
}

export async function deleteInstructionCard(channelId: string, instructionId: string): Promise<void> {
  const res = await fetch(`/api/channels/${channelId}/instructions/${instructionId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete instruction card')
  }
}

// ===== GLOBAL SHROOMS =====

export async function fetchGlobalShrooms(): Promise<{ instructionCards: InstructionCard[] }> {
  const res = await fetch('/api/global-shrooms', { cache: 'no-store' })
  if (!res.ok) {
    // Don't throw - global shrooms are optional
    return { instructionCards: [] }
  }
  return res.json()
}

// ===== MIGRATION =====

export async function migrateData(data: unknown): Promise<{ migrated: Record<string, number> }> {
  const res = await fetch('/api/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error('Migration failed')
  }
  return res.json()
}
