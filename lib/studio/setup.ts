import { db } from '@/lib/db'
import { channels, columns, studioSettings, userChannelOrg } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

/**
 * Making, and finding, someone's Studio.
 *
 * A Studio is an ordinary channel — nothing about the board is special — plus one
 * row that says which columns are which stage. That
 * keeps everything else in Kanthink working on it unchanged: sharing, search, the
 * card drawer, Kan's normal card actions.
 */

export type StudioRow = typeof studioSettings.$inferSelect

export const STUDIO_COLUMNS = [
  { key: 'sparksColumnId', name: 'Sparks' },
  { key: 'testingColumnId', name: 'Testing' },
  { key: 'buildingColumnId', name: 'Building' },
  { key: 'readyColumnId', name: 'Ready for you' },
  { key: 'liveColumnId', name: 'Live' },
  { key: 'droppedColumnId', name: 'Dropped' },
] as const

export type StudioStage = 'sparks' | 'testing' | 'building' | 'ready' | 'live' | 'dropped'

export function columnFor(studio: StudioRow, stage: StudioStage): string {
  return {
    sparks: studio.sparksColumnId,
    testing: studio.testingColumnId,
    building: studio.buildingColumnId,
    ready: studio.readyColumnId,
    live: studio.liveColumnId,
    dropped: studio.droppedColumnId,
  }[stage]
}

/**
 * The brief, as the channel's standing instructions. The spark engine follows the
 * "Learned from conversations" lines at the end; Kan appends to them.
 */
export const DEFAULT_BRIEF = `Studio brief

The goal is money. Find opportunities in what I'm already curious about and good at — what I read, save, spend my hours on and build — and keep each one moving until it earns or is dropped.

What a spark is: a specific, creative way to make money, set off by something of mine (a read, a bookmark, where my time goes, a board), with a reason I'm the one to do it: expertise, access or tools. An app, a product, a service, content that earns, or a feature for something I already run. Never generic.
Every spark comes with a first move I can do today in under 30 minutes, and a test page to see if anyone cares before anything is built.
Each morning: three new sparks, and the one next step for each idea that's already moving.
Never: health, legal or financial advice; copies of a named product; anything that collects data about children.

Learned from conversations:`

export async function getStudio(userId: string): Promise<StudioRow | null> {
  const row = await db.query.studioSettings.findFirst({ where: eq(studioSettings.userId, userId) })
  if (!row) return null
  // The channel can be deleted out from under the row; treat that as no Studio.
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, row.channelId), columns: { id: true } })
  return channel ? row : null
}

export async function getStudioByChannel(channelId: string): Promise<StudioRow | null> {
  return (await db.query.studioSettings.findFirst({ where: eq(studioSettings.channelId, channelId) })) ?? null
}

/** The user's Studio, made if they don't have one. Safe to call twice. */
export async function ensureStudio(userId: string): Promise<{ studio: StudioRow; created: boolean }> {
  const existing = await getStudio(userId)
  if (existing) return { studio: existing, created: false }

  // A row left behind by a deleted channel would block the insert below.
  await db.delete(studioSettings).where(eq(studioSettings.userId, userId))

  const now = new Date()
  const channelId = crypto.randomUUID()
  await db.insert(channels).values({
    id: channelId,
    ownerId: userId,
    name: 'Studio',
    description: 'Money ideas from what you read, save and work on — tested, built and kept moving.',
    aiInstructions: DEFAULT_BRIEF,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  const ids = Object.fromEntries(STUDIO_COLUMNS.map((c) => [c.key, crypto.randomUUID()])) as Record<(typeof STUDIO_COLUMNS)[number]['key'], string>
  await db.insert(columns).values(STUDIO_COLUMNS.map((c, i) => ({
    id: ids[c.key],
    channelId,
    name: c.name,
    position: i,
    isAiTarget: c.key === 'sparksColumnId',
    createdAt: now,
    updatedAt: now,
  })))

  const top = await db.query.userChannelOrg.findFirst({
    where: eq(userChannelOrg.userId, userId),
    orderBy: [desc(userChannelOrg.position)],
  })
  await db.insert(userChannelOrg).values({ userId, channelId, position: (top?.position ?? -1) + 1 })

  await db.insert(studioSettings).values({
    userId,
    channelId,
    ...ids,
    sparkEmail: true,
    followUpMode: 'ask',
    handledSparkIds: [],
    createdAt: now,
    updatedAt: now,
  })

  const studio = (await db.query.studioSettings.findFirst({ where: eq(studioSettings.userId, userId) }))!
  return { studio, created: true }
}
