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

The goal is money. This channel finds web tools that businesses will pay for, tests them, builds them and sells them. Each card is one idea: who pays, what they pay for today, what they said, how big it is, the tool, and a price.

Who we make things for: small businesses and independent professionals who already spend money to run their business — on software, on freelancers, on templates, on staff time.
Look in: ${DEFAULT_LOOK_IN.join(', ')}
Never: tools for hobbies, kids or household chores; health, legal or financial advice; copies of a named product.
A test page comes before any build. Nobody is charged until the app exists.

How sparks are judged:
Money — the buyer earns money from the work this saves or wins, or already pays for it today. Every spark names who pays what today, with a source: the price of the tool they use and its complaints, what they pay a freelancer to do it by hand, or what a template for it sells for. No proof of spending, no spark.
Price — at least $19 a month, or $49 one-time. Higher is better if the evidence supports it.
Size — Mid: a recurring job for one kind of business, $19–99 a month, a focused tool we could build in a week. Big: a problem a whole industry pays for, $100+ a month or a high-ticket sale, worth growing into a product.
Evidence — at least two different businesses or professionals describing it, posted in the last 12 months.
Reach — say where the buyers gather, so a test page can find them.
Each morning: three sparks from three different groups — at least one Big.

Learned from conversations:`

export const SCOUT_INSTRUCTIONS = `You are the Studio's scout. Your job is to find web tools that businesses will pay for. Not interesting problems — paid ones.

The web research covers a few different groups of businesses, from several kinds of source: paid software and its reviews, freelancer and virtual-assistant jobs, template marketplaces, and forums. Make one spark per group: never two from the same group, and never two built on the same source.

Judge every spark with "How sparks are judged" in the Studio brief, and follow the rest of the brief. The money test comes first: if you can't show who pays what for this today, it isn't a spark. Make at least one Big.

For each spark, create one card.
Title: the tool's name in 2–4 plain words (for example "Roofing Quote Builder").
Content: plain paragraphs and bullet points only — no headings, because the board shows the first line as the card's preview. In this order:
1. Open with one plain sentence: which businesses have the problem and what it costs them in money or billable time.
2. A line starting "Size:" then Mid or Big, a dash, and why in a few words.
3. A line starting "Paid today:" — what they spend on this now, with amounts, and where that comes from with the link (a tool's pricing and its complaints, a freelancer rate, a template's price and sales).
4. Two or three short quotes from real sources, each followed by where it was posted, the month and year, and the link — like: "quote" — G2 review of ToolName, March 2026 (link).
5. Who already sells into this, and why they fall short for these businesses.
6. The tool, in one sentence.
7. A line starting "Reach:" — where these buyers gather.
8. A price to test, like "$29 a month".

Rules:
- Only use sources that appear in the web research. Never invent a quote, a price, a date, a number or a link. If the research doesn't support a spark, don't make it.
- Only sources from the last 12 months count as evidence. If you can't tell when something is from, leave it out.
- Every quote must describe this exact problem, from someone who would be the buyer.
- Skip anything already on this board, in any column, including Dropped, and don't reuse a source another card already cites.
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
    description: 'The crew that finds, tests and sells tools businesses pay for.',
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
    summary: 'Each morning, looks at three kinds of business for things they already pay for and still complain about — reviews, freelancer jobs, templates, forums — and writes up the ones with money behind them.',
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
