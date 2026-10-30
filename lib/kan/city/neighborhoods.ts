import { db } from '@/lib/db'
import { channels, folders, userChannelOrg } from '@/lib/db/schema'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

/**
 * Neighborhoods: Kan City's districts, and the board's folders. They're the same
 * thing, so making one in the city makes a folder on the board and the other way round.
 *
 * A neighborhood is also a fence. A channel's bot may help anywhere in its own
 * neighborhood (read the other channels, add cards, leave notes) and can never
 * reach past it. A channel in no folder (Downtown) keeps its bot to itself, so
 * putting channels together is always a choice you made.
 */

export interface Neighborhood {
  folderId: string | null
  name: string
  /** Every channel the bot may work in: its own first. */
  channelIds: string[]
}

/** The channels a bot in `channelId` may reach, as the channel's owner arranged them. */
export async function neighborhoodOf(ownerId: string, channelId: string): Promise<Neighborhood> {
  const row = await db.query.userChannelOrg.findFirst({
    where: and(eq(userChannelOrg.userId, ownerId), eq(userChannelOrg.channelId, channelId)),
    columns: { folderId: true },
  })
  if (!row?.folderId) return { folderId: null, name: 'Downtown', channelIds: [channelId] }
  const [folder, members] = await Promise.all([
    db.query.folders.findFirst({ where: and(eq(folders.id, row.folderId), eq(folders.userId, ownerId)), columns: { name: true } }),
    db.query.userChannelOrg.findMany({ where: and(eq(userChannelOrg.userId, ownerId), eq(userChannelOrg.folderId, row.folderId)), columns: { channelId: true } }),
  ])
  if (!folder) return { folderId: null, name: 'Downtown', channelIds: [channelId] }
  // Only the owner's own live channels: a shared channel filed here isn't theirs to send a bot into.
  const ids = members.map((m) => m.channelId)
  const owned = ids.length
    ? await db.query.channels.findMany({ where: and(inArray(channels.id, ids), eq(channels.ownerId, ownerId), eq(channels.status, 'active')), columns: { id: true } })
    : []
  const rest = owned.map((c) => c.id).filter((id) => id !== channelId).sort()
  return { folderId: row.folderId, name: folder.name, channelIds: [channelId, ...rest] }
}

/** File a channel into a neighborhood (a folder), or back Downtown with null. */
export async function moveToNeighborhood(userId: string, channelId: string, folderId: string | null): Promise<{ ok: true } | { error: string }> {
  if (folderId) {
    const f = await db.query.folders.findFirst({ where: and(eq(folders.id, folderId), eq(folders.userId, userId)), columns: { id: true } })
    if (!f) return { error: 'That neighborhood isn’t one of theirs.' }
  }
  const { canViewChannel } = await import('@/lib/api/permissions')
  if (!(await canViewChannel(channelId, userId))) return { error: 'No such channel.' }
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${userChannelOrg.position}), -1)` }).from(userChannelOrg)
    .where(and(eq(userChannelOrg.userId, userId), folderId ? eq(userChannelOrg.folderId, folderId) : isNull(userChannelOrg.folderId)))
  const position = Number(n) + 1
  const existing = await db.query.userChannelOrg.findFirst({ where: and(eq(userChannelOrg.userId, userId), eq(userChannelOrg.channelId, channelId)), columns: { id: true } })
  if (existing) await db.update(userChannelOrg).set({ folderId, position }).where(eq(userChannelOrg.id, existing.id))
  else await db.insert(userChannelOrg).values({ userId, channelId, folderId, position })
  return { ok: true }
}

/** Start a neighborhood, optionally moving channels into it straight away. */
export async function createNeighborhood(userId: string, name: string, channelIds: string[] = []): Promise<{ folderId: string; name: string } | { error: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) return { error: 'A neighborhood needs a name.' }
  const same = await db.query.folders.findFirst({ where: and(eq(folders.userId, userId), sql`lower(${folders.name}) = ${clean.toLowerCase()}`), columns: { id: true, name: true } })
  let folderId = same?.id
  if (!folderId) {
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${folders.position}), -1)` }).from(folders).where(eq(folders.userId, userId))
    folderId = crypto.randomUUID()
    await db.insert(folders).values({ id: folderId, userId, name: clean, position: Number(n) + 1 })
  }
  for (const id of channelIds) {
    const r = await moveToNeighborhood(userId, id, folderId)
    if ('error' in r) return r
  }
  return { folderId, name: same?.name ?? clean }
}

export async function renameNeighborhood(userId: string, folderId: string, name: string): Promise<{ ok: true } | { error: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) return { error: 'A neighborhood needs a name.' }
  const r = await db.update(folders).set({ name: clean, updatedAt: new Date() }).where(and(eq(folders.id, folderId), eq(folders.userId, userId))).returning({ id: folders.id })
  return r.length ? { ok: true } : { error: 'That neighborhood isn’t one of theirs.' }
}

/** Their neighborhoods by name, for the tools and the page. */
export async function listNeighborhoods(userId: string) {
  return db.query.folders.findMany({ where: eq(folders.userId, userId), columns: { id: true, name: true }, orderBy: [folders.position] })
}
