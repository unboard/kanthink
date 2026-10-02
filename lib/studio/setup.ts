import { db } from '@/lib/db'
import { channels, columns, instructionCards, studioSettings, userChannelOrg } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { DEFAULT_LOOK_IN, scoutFocus } from './scoutFocus'

/**
 * Making, and finding, someone's Studio.
 *
 * A Studio is an ordinary channel — nothing about the board is special — plus one
 * row that says which columns are which stage and which shroom is the scout. That
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

/** The brief, as the channel's standing instructions. Kan appends what it learns. */
export const DEFAULT_BRIEF = `Studio brief

This channel finds, tests and sells web tools. Each card is one idea: who has the problem, what they said in public, how big it is, the tool, and a price to test.

Who we make things for: parents and families, teachers, and one-person businesses (landlords, sitters, food trucks, resellers).
Look in: ${DEFAULT_LOOK_IN.join(', ')}
Never: health, legal or money advice; copies of a named product; kids' apps that collect data.
A test page comes before any build. Nobody is charged until the app exists.

How sparks are judged:
Size — Small: one task for one kind of person, a one-time price ($3–15), a single page we could build in a day. Mid: a weekly job for a defined group, a monthly price ($5–30), remembers their data. Big: a problem lots of people already pay real money to solve, worth growing into a product; may need accounts and a server.
Evidence — at least two different people describing it, posted in the last 12 months. Older posts don't count.
Pay signal — they already pay for something clumsy, or say they would.
Competition — what exists, and why it falls short for these people.
Each morning: three sparks from three different groups, aiming for one Small, one Mid and one Big.

Learned from conversations:`

export const SCOUT_INSTRUCTIONS = `You are the Studio's scout. Find new sparks: specific problems that real people describe in public — forum and Reddit threads, Q&A sites, 1–3 star reviews of paid tools — that a web tool could solve and that someone would pay for.

The web research covers a few different groups. Make one spark per group: never two from the same group, and never two built on the same post.

Judge every spark with "How sparks are judged" in the Studio brief, and follow the rest of the brief: who to look for and what to avoid. Aim for a mix of sizes across the run.

For each spark, create one card.
Title: the tool's name in 2–4 plain words (for example "Sub Plan Writer").
Content: plain paragraphs and bullet points only — no headings, because the board shows the first line as the card's preview. In this order:
1. Open with one plain sentence: who has the problem and what it costs them.
2. A line starting "Size:" then Small, Mid or Big, a dash, and why in a few words (who pays, how often, roughly how much).
3. Two or three short quotes from real posts, each followed by where it was posted, the month and year it was posted, and the link — like: "quote" — r/petsitting, March 2026 (link).
4. Whether anything already solves it, and how well.
5. The tool, in one sentence.
6. A price to test, like "$5 once" or "$12 a month".

Rules:
- Only use posts that appear in the web research. Never invent a quote, a date, a number or a link. If the research doesn't support a spark, don't make it.
- Only posts from the last 12 months count as evidence. If you can't tell when a post is from, leave it out.
- Skip anything already on this board, in any column, including Dropped, and don't reuse a post another card already cites.
- Skip anything the brief rules out.`

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
    description: 'The crew that finds, tests and sells small apps.',
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

  const scoutId = crypto.randomUUID()
  await db.insert(instructionCards).values({
    id: scoutId,
    channelId,
    title: 'Scout',
    instructions: SCOUT_INSTRUCTIONS,
    action: 'generate',
    target: { type: 'column', columnId: ids.sparksColumnId },
    contextColumns: { type: 'all' },
    runMode: 'automatic',
    cardCount: 3,
    isEnabled: true,
    triggers: [{ type: 'scheduled', interval: 'daily', specificTime: '06:00' }],
    safeguards: { cooldownMinutes: 10, dailyCap: 3, preventLoops: true },
    // Due now, so the next cron tick runs it rather than tomorrow's.
    nextScheduledRun: now,
    // Sparks wait for your yes: each lands for review, shows on Home as a card, and
    // approving it puts up the test page.
    autoApprove: 0,
    // Rotated each morning by the Studio cron; see scoutFocus.ts.
    webAccess: { mode: 'always', focus: scoutFocus(DEFAULT_LOOK_IN, now) },
    summary: 'Reads the web each morning across three groups for recent problems people would pay to solve, sizes each one, and writes it up as a spark.',
    createdAt: now,
    updatedAt: now,
  } as typeof instructionCards.$inferInsert)

  await db.insert(studioSettings).values({
    userId,
    channelId,
    ...ids,
    scoutShroomId: scoutId,
    sparkEmail: true,
    followUpMode: 'ask',
    handledSparkIds: [],
    createdAt: now,
    updatedAt: now,
  })

  const studio = (await db.query.studioSettings.findFirst({ where: eq(studioSettings.userId, userId) }))!
  return { studio, created: true }
}
