import { db } from '@/lib/db'
import { channels, channelShares, users, userChannelOrg } from '@/lib/db/schema'
import { eq, and, or, inArray, desc } from 'drizzle-orm'

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
  userId: string,
  userEmail?: string | null
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

  // Check if user has a share (by userId)
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

  // Fallback: check for pending email invites (userId is null but email matches)
  // This handles the case where convertPendingInvites hasn't run yet
  if (userEmail) {
    const emailShare = await db.query.channelShares.findFirst({
      where: and(
        eq(channelShares.channelId, channelId),
        eq(channelShares.email, userEmail.toLowerCase()),
        eq(channelShares.userId, null as unknown as string)
      ),
    })

    if (emailShare) {
      // Auto-convert this pending invite now
      await db
        .update(channelShares)
        .set({ userId, acceptedAt: new Date() })
        .where(eq(channelShares.id, emailShare.id))

      // Create userChannelOrg entry
      try {
        const existingOrg = await db.query.userChannelOrg.findMany({
          where: eq(userChannelOrg.userId, userId),
          orderBy: [desc(userChannelOrg.position)],
          limit: 1,
        })
        const nextPosition = existingOrg.length > 0 ? existingOrg[0].position + 1 : 0
        await db.insert(userChannelOrg).values({
          userId,
          channelId,
          position: nextPosition,
        })
      } catch {
        // Ignore if org entry already exists
      }

      const role = emailShare.role as ChannelRole
      return {
        channelId,
        userId,
        role,
        isOwner: false,
        canEdit: role === 'editor' || role === 'owner',
        canDelete: false,
        canManageShares: false,
      }
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
export async function getUserChannels(userId: string, userEmail?: string | null): Promise<Array<{ channelId: string; role: ChannelRole }>> {
  // Get owned channels
  const ownedChannels = await db.query.channels.findMany({
    where: eq(channels.ownerId, userId),
    columns: { id: true },
  })

  // Get shared channels (by userId)
  const sharedChannels = await db.query.channelShares.findMany({
    where: eq(channelShares.userId, userId),
    columns: { channelId: true, role: true },
  })

  // Also find pending email invites and auto-convert them
  if (userEmail) {
    const pendingEmailShares = await db
      .select()
      .from(channelShares)
      .where(
        and(
          eq(channelShares.email, userEmail.toLowerCase()),
          eq(channelShares.userId, null as unknown as string)
        )
      )

    for (const pending of pendingEmailShares) {
      // Check no duplicate share exists
      const exists = sharedChannels.some(s => s.channelId === pending.channelId)
      if (!exists) {
        await db.update(channelShares).set({ userId, acceptedAt: new Date() }).where(eq(channelShares.id, pending.id))
        try {
          const existingOrg = await db.query.userChannelOrg.findMany({
            where: eq(userChannelOrg.userId, userId),
            orderBy: [desc(userChannelOrg.position)],
            limit: 1,
          })
          const nextPos = existingOrg.length > 0 ? existingOrg[0].position + 1 : 0
          await db.insert(userChannelOrg).values({ userId, channelId: pending.channelId, position: nextPos })
        } catch { /* ignore duplicate */ }
        sharedChannels.push({ channelId: pending.channelId, role: pending.role })
      }
    }
  }

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
export async function getUserChannelsWithSharerInfo(userId: string, userEmail?: string | null): Promise<Array<{
  channelId: string
  role: ChannelRole
  sharedBy?: SharedByInfo
}>> {
  // Get owned channels
  const ownedChannels = await db.query.channels.findMany({
    where: eq(channels.ownerId, userId),
    columns: { id: true },
  })

  // Get shared channels with the invitedBy user info (by userId)
  const sharedChannels = await db.query.channelShares.findMany({
    where: eq(channelShares.userId, userId),
    columns: { channelId: true, role: true, invitedBy: true },
  })

  // Also find and auto-convert pending email invites
  if (userEmail) {
    const pendingEmailShares = await db
      .select()
      .from(channelShares)
      .where(
        and(
          eq(channelShares.email, userEmail.toLowerCase()),
          eq(channelShares.userId, null as unknown as string)
        )
      )

    for (const pending of pendingEmailShares) {
      const alreadyHasShare = sharedChannels.some(s => s.channelId === pending.channelId)
      if (!alreadyHasShare) {
        // Auto-convert this pending invite
        await db.update(channelShares).set({ userId, acceptedAt: new Date() }).where(eq(channelShares.id, pending.id))
        try {
          const existingOrg = await db.query.userChannelOrg.findMany({
            where: eq(userChannelOrg.userId, userId),
            orderBy: [desc(userChannelOrg.position)],
            limit: 1,
          })
          const nextPos = existingOrg.length > 0 ? existingOrg[0].position + 1 : 0
          await db.insert(userChannelOrg).values({ userId, channelId: pending.channelId, position: nextPos })
        } catch { /* ignore duplicate */ }
        sharedChannels.push({ channelId: pending.channelId, role: pending.role, invitedBy: pending.invitedBy })
      } else {
        // Clean up orphaned pending share
        await db.delete(channelShares).where(eq(channelShares.id, pending.id))
      }
    }
  }

  // Get channel IDs that are shared (not owned) to fetch their owners
  const ownedIds = new Set(ownedChannels.map(c => c.id))
  const sharedChannelIds = sharedChannels
    .filter(s => !ownedIds.has(s.channelId))
    .map(s => s.channelId)

  // Get inviter IDs and channel owner IDs for fallback
  const inviterIds = sharedChannels
    .map(s => s.invitedBy)
    .filter((id): id is string => id !== null)

  // Fetch the channels to get owner IDs (for fallback when invitedBy is null)
  let channelOwnerMap: Map<string, string> = new Map()
  if (sharedChannelIds.length > 0) {
    const sharedChannelData = await db.query.channels.findMany({
      where: inArray(channels.id, sharedChannelIds),
      columns: { id: true, ownerId: true },
    })
    for (const ch of sharedChannelData) {
      if (ch.ownerId) channelOwnerMap.set(ch.id, ch.ownerId)
    }
  }

  // Collect all user IDs we need to fetch (inviters + owners)
  const ownerIds = [...channelOwnerMap.values()]
  const allUserIds = [...new Set([...inviterIds, ...ownerIds])]

  let usersMap: Map<string, SharedByInfo> = new Map()
  if (allUserIds.length > 0) {
    const usersList = await db.query.users.findMany({
      where: inArray(users.id, allUserIds),
      columns: { id: true, name: true, email: true, image: true },
    })
    for (const u of usersList) {
      usersMap.set(u.id, {
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

  // Add shared channels with sharer info (inviter or fallback to owner)
  for (const share of sharedChannels) {
    if (!ownedIds.has(share.channelId)) {
      // Try invitedBy first, fall back to channel owner
      let sharedBy: SharedByInfo | undefined
      if (share.invitedBy) {
        sharedBy = usersMap.get(share.invitedBy)
      }
      if (!sharedBy) {
        const ownerId = channelOwnerMap.get(share.channelId)
        if (ownerId) {
          sharedBy = usersMap.get(ownerId)
        }
      }
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
  level: 'view' | 'edit' | 'delete' | 'manage_shares',
  userEmail?: string | null
): Promise<ChannelPermission> {
  const permission = await getChannelPermission(channelId, userId, userEmail)

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
  // Find pending invites for this email (shares with no userId assigned)
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

  // Get current max org position for the user
  const existingOrg = await db.query.userChannelOrg.findMany({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
    limit: 1,
  })
  let nextPosition = existingOrg.length > 0 ? existingOrg[0].position + 1 : 0

  // Convert each pending invite
  for (const invite of pendingInvites) {
    // Check there isn't already a share with this userId for the same channel
    // (e.g. from an invite link that was accepted separately)
    const existingShare = await db.query.channelShares.findFirst({
      where: and(
        eq(channelShares.channelId, invite.channelId),
        eq(channelShares.userId, userId)
      ),
    })

    if (existingShare) {
      // Already has a proper share — delete the orphaned pending one
      await db.delete(channelShares).where(eq(channelShares.id, invite.id))
      continue
    }

    // Convert the pending share
    await db
      .update(channelShares)
      .set({
        userId,
        acceptedAt: new Date(),
      })
      .where(eq(channelShares.id, invite.id))

    // Create userChannelOrg entry so the channel appears in sidebar
    try {
      await db.insert(userChannelOrg).values({
        userId,
        channelId: invite.channelId,
        position: nextPosition++,
      })
    } catch {
      // Ignore if org entry already exists (unique constraint)
    }
  }

  return pendingInvites.length
}
