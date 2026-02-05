import { db } from '@/lib/db'
import { channels, channelShares, users } from '@/lib/db/schema'
import { eq, and, or, inArray } from 'drizzle-orm'

export type ChannelRole = 'owner' | 'editor' | 'viewer'

export interface SharedByInfo {
  id: string
  name: string | null
  email: string
  image: string | null
}

export interface ChannelPermission {
  channelId: string
  userId: string
  role: ChannelRole
  isOwner: boolean
  canEdit: boolean
  canDelete: boolean
  canManageShares: boolean
}

/**
 * Get user's permission for a specific channel.
 * Returns null if user has no access.
 */
export async function getChannelPermission(
  channelId: string,
  userId: string
): Promise<ChannelPermission | null> {
  // Check if user is the owner
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  })

  if (!channel) {
    return null
  }

  if (channel.ownerId === userId) {
    return {
      channelId,
      userId,
      role: 'owner',
      isOwner: true,
      canEdit: true,
      canDelete: true,
      canManageShares: true,
    }
  }

  // Check if user has a share
  const share = await db.query.channelShares.findFirst({
    where: and(
      eq(channelShares.channelId, channelId),
      eq(channelShares.userId, userId)
    ),
  })

  if (share) {
    const role = share.role as ChannelRole
    return {
      channelId,
      userId,
      role,
      isOwner: false,
      canEdit: role === 'editor' || role === 'owner',
      canDelete: false, // Only owner can delete
      canManageShares: role === 'owner', // Only owner can manage shares
    }
  }

  // Grant viewer access to global help channels for any authenticated user
  if (channel.isGlobalHelp) {
    return {
      channelId,
      userId,
      role: 'viewer',
      isOwner: false,
      canEdit: false,
      canDelete: false,
      canManageShares: false,
    }
  }

  return null
}

/**
 * Check if user can view a channel.
 */
export async function canViewChannel(channelId: string, userId: string): Promise<boolean> {
  const permission = await getChannelPermission(channelId, userId)
  return permission !== null
}

/**
 * Check if user can edit a channel (cards, columns, etc.).
 */
export async function canEditChannel(channelId: string, userId: string): Promise<boolean> {
  const permission = await getChannelPermission(channelId, userId)
  return permission?.canEdit ?? false
}

/**
 * Check if user can delete a channel.
 */
export async function canDeleteChannel(channelId: string, userId: string): Promise<boolean> {
  const permission = await getChannelPermission(channelId, userId)
  return permission?.canDelete ?? false
}

/**
 * Check if user can manage shares for a channel.
 */
export async function canManageShares(channelId: string, userId: string): Promise<boolean> {
  const permission = await getChannelPermission(channelId, userId)
  return permission?.canManageShares ?? false
}

/**
 * Get all channels accessible to a user (owned + shared + global help).
 * Returns channel IDs with their roles.
 */
export async function getUserChannels(userId: string): Promise<Array<{ channelId: string; role: ChannelRole }>> {
  // Get owned channels
  const ownedChannels = await db.query.channels.findMany({
    where: eq(channels.ownerId, userId),
    columns: { id: true },
  })

  // Get shared channels
  const sharedChannels = await db.query.channelShares.findMany({
    where: eq(channelShares.userId, userId),
    columns: { channelId: true, role: true },
  })

  // Get global help channels (available to all users)
  // Wrapped in try-catch in case the column doesn't exist yet
  let globalHelpChannels: { id: string }[] = []
  try {
    globalHelpChannels = await db.query.channels.findMany({
      where: eq(channels.isGlobalHelp, true),
      columns: { id: true },
    })
  } catch (e) {
    // Column may not exist yet - ignore
  }

  const result: Array<{ channelId: string; role: ChannelRole }> = []

  // Add owned channels
  for (const channel of ownedChannels) {
    result.push({ channelId: channel.id, role: 'owner' })
  }

  // Add shared channels (avoid duplicates)
  const ownedIds = new Set(ownedChannels.map(c => c.id))
  for (const share of sharedChannels) {
    if (!ownedIds.has(share.channelId)) {
      result.push({ channelId: share.channelId, role: share.role as ChannelRole })
    }
  }

  // Add global help channels with viewer role (avoid duplicates)
  const existingIds = new Set(result.map(r => r.channelId))
  for (const channel of globalHelpChannels) {
    if (!existingIds.has(channel.id)) {
      result.push({ channelId: channel.id, role: 'viewer' })
    }
  }

  return result
}

/**
 * Get all channels accessible to a user with extended info including sharer details.
 * Returns channel IDs with their roles and who shared it (if applicable).
 */
export async function getUserChannelsWithSharerInfo(userId: string): Promise<Array<{
  channelId: string
  role: ChannelRole
  sharedBy?: SharedByInfo
}>> {
  // Get owned channels
  const ownedChannels = await db.query.channels.findMany({
    where: eq(channels.ownerId, userId),
    columns: { id: true },
  })

  // Get shared channels with the invitedBy user info
  const sharedChannels = await db.query.channelShares.findMany({
    where: eq(channelShares.userId, userId),
    columns: { channelId: true, role: true, invitedBy: true },
  })

  // Get the users who invited (sharedBy)
  const inviterIds = sharedChannels
    .map(s => s.invitedBy)
    .filter((id): id is string => id !== null)

  let invitersMap: Map<string, SharedByInfo> = new Map()
  if (inviterIds.length > 0) {
    const inviters = await db.query.users.findMany({
      where: inArray(users.id, inviterIds),
      columns: { id: true, name: true, email: true, image: true },
    })
    for (const u of inviters) {
      invitersMap.set(u.id, {
        id: u.id,
        name: u.name,
        email: u.email ?? '',
        image: u.image,
      })
    }
  }

  // Get global help channels
  let globalHelpChannels: { id: string }[] = []
  try {
    globalHelpChannels = await db.query.channels.findMany({
      where: eq(channels.isGlobalHelp, true),
      columns: { id: true },
    })
  } catch {
    // Column may not exist yet
  }

  const result: Array<{ channelId: string; role: ChannelRole; sharedBy?: SharedByInfo }> = []

  // Add owned channels
  for (const channel of ownedChannels) {
    result.push({ channelId: channel.id, role: 'owner' })
  }

  // Add shared channels with sharer info
  const ownedIds = new Set(ownedChannels.map(c => c.id))
  for (const share of sharedChannels) {
    if (!ownedIds.has(share.channelId)) {
      const sharedBy = share.invitedBy ? invitersMap.get(share.invitedBy) : undefined
      result.push({
        channelId: share.channelId,
        role: share.role as ChannelRole,
        sharedBy,
      })
    }
  }

  // Add global help channels with viewer role
  const existingIds = new Set(result.map(r => r.channelId))
  for (const channel of globalHelpChannels) {
    if (!existingIds.has(channel.id)) {
      result.push({ channelId: channel.id, role: 'viewer' })
    }
  }

  return result
}

/**
 * Require a specific permission level, throwing an error if not met.
 * Useful for API routes.
 */
export async function requirePermission(
  channelId: string,
  userId: string,
  level: 'view' | 'edit' | 'delete' | 'manage_shares'
): Promise<ChannelPermission> {
  const permission = await getChannelPermission(channelId, userId)

  if (!permission) {
    throw new PermissionError('Channel not found or access denied', 404)
  }

  switch (level) {
    case 'view':
      // Any permission level can view
      break
    case 'edit':
      if (!permission.canEdit) {
        throw new PermissionError('You do not have edit access to this channel', 403)
      }
      break
    case 'delete':
      if (!permission.canDelete) {
        throw new PermissionError('Only the channel owner can delete this channel', 403)
      }
      break
    case 'manage_shares':
      if (!permission.canManageShares) {
        throw new PermissionError('Only the channel owner can manage sharing', 403)
      }
      break
  }

  return permission
}

/**
 * Custom error class for permission errors.
 */
export class PermissionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 403
  ) {
    super(message)
    this.name = 'PermissionError'
  }
}

/**
 * Convert pending email invites to active shares when a user signs up/in.
 * Call this after user authentication.
 */
export async function convertPendingInvites(userId: string, email: string): Promise<number> {
  // Find pending invites for this email
  const pendingInvites = await db
    .select()
    .from(channelShares)
    .where(
      and(
        eq(channelShares.email, email.toLowerCase()),
        eq(channelShares.userId, null as unknown as string)
      )
    )

  if (pendingInvites.length === 0) {
    return 0
  }

  // Convert each pending invite
  for (const invite of pendingInvites) {
    await db
      .update(channelShares)
      .set({
        userId,
        acceptedAt: new Date(),
      })
      .where(eq(channelShares.id, invite.id))
  }

  return pendingInvites.length
}
