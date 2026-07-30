import { db } from '@/lib/db'
import { cards, channels, tasks } from '@/lib/db/schema'
import { asc, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { inColumnBucket } from '@/lib/db/cardBuckets'
import type { CardInput } from '@/lib/types'

/**
 * Server-side application of shroom output.
 *
 * Everything a shroom does is written here, so a run means the same thing whether it
 * was started from an open board, an overnight cron, or a card landing in a column.
 *
 * Creation has to be server-side for a second reason: generated cards must be born with
 * is_pending_review already set, so they exist as reviewable rows from the moment they're
 * made. Creating them client-side would leave a window where unreviewed output renders as
 * a real card, and would require the card PATCH whitelist to accept the flag — turning
 * PATCH into a spoofable approve path.
 */

export interface CreateShroomCardsOptions {
  channelId: string
  columnId: string
  /** Cards to create, as returned by the run-instruction planner. */
  generatedCards: CardInput[]
  /** The shroom that produced them. */
  instructionCardId: string
  /** When true, cards go straight to the board. Otherwise they land in review. */
  autoApprove?: boolean
  /** Valid channel member ids — assignees not in this set are dropped. */
  validMemberIds?: string[]
}

export interface CreateShroomCardsResult {
  runId: string
  created: { id: string; title: string; position: number }[]
  pending: boolean
}

/**
 * Create the cards a shroom generated, in one bucket-safe batch.
 *
 * All cards from a single run share a `reviewRunId`, so the review UI can group them
 * and the notification deep-link can find the column they landed in.
 */
export async function createShroomCards(
  options: CreateShroomCardsOptions
): Promise<CreateShroomCardsResult> {
  const {
    channelId,
    columnId,
    generatedCards,
    instructionCardId,
    autoApprove = false,
    validMemberIds,
  } = options

  const runId = nanoid()
  const isPendingReview = !autoApprove
  const bucket = isPendingReview ? 'review' : 'active'

  if (generatedCards.length === 0) {
    return { runId, created: [], pending: isPendingReview }
  }

  // One max-position read for the whole batch rather than one per card — there are no
  // transactions available here (the libsql client is plain HTTP drizzle), so keeping
  // the number of round-trips down also keeps the window for interleaving small.
  const existing = await db.query.cards.findMany({
    where: inColumnBucket(columnId, bucket),
    orderBy: [desc(cards.position)],
    limit: 1,
  })
  let nextPosition = (existing.length > 0 ? existing[0].position : -1) + 1

  const memberIds = validMemberIds ? new Set(validMemberIds) : null
  const created: CreateShroomCardsResult['created'] = []
  const now = new Date()
  const nowIso = now.toISOString()

  for (const input of generatedCards) {
    const cardId = nanoid()
    const position = nextPosition++

    // Drop hallucinated member ids rather than writing them to the row
    const assignedTo = memberIds
      ? input.assignedTo?.filter((id) => memberIds.has(id))
      : input.assignedTo

    const messages = input.initialMessage
      ? [
          {
            id: nanoid(),
            type: 'ai_response' as const,
            content: input.initialMessage,
            createdAt: nowIso,
          },
        ]
      : []

    await db.insert(cards).values({
      id: cardId,
      channelId,
      columnId,
      title: input.title,
      messages: messages as typeof cards.$inferInsert.messages,
      source: 'ai',
      position,
      isPendingReview,
      reviewRunId: runId,
      createdByInstructionId: instructionCardId,
      assignedTo: assignedTo?.length ? assignedTo : null,
      createdAt: now,
      updatedAt: now,
    })

    created.push({ id: cardId, title: input.title, position })
  }

  return { runId, created, pending: isPendingReview }
}

/** One card's worth of edits, as returned by the modify planner. */
export interface ShroomModification {
  id: string
  title: string
  content?: string
  tags?: string[]
  properties?: { key: string; value: string; displayType?: 'chip' | 'field'; color?: string }[]
  tasks?: { title: string; description?: string; assignedTo?: string[] }[]
  assignedTo?: string[]
}

export interface ApplyModificationsResult {
  modifiedCardIds: string[]
  tasksCreated: number
}

const TAG_COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan']

/**
 * Write a `modify` shroom's edits.
 *
 * Mirrors what Board.tsx does when a run happens with the board open — title, an
 * appended AI message, tags, properties, tasks and assignees — so an unattended run
 * produces the same result as a watched one. Before this existed, a modify shroom run
 * by cron computed every edit and then dropped them all on the floor.
 */
export async function applyShroomModifications(options: {
  channelId: string
  instructionCardId: string
  modifications: ShroomModification[]
  /** Valid channel member ids — assignees outside this set are dropped. */
  validMemberIds?: string[]
}): Promise<ApplyModificationsResult> {
  const { channelId, instructionCardId, modifications, validMemberIds } = options
  const memberIds = validMemberIds ? new Set(validMemberIds) : null
  const modifiedCardIds: string[] = []
  let tasksCreated = 0

  if (modifications.length === 0) return { modifiedCardIds, tasksCreated }

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
    columns: { id: true, tagDefinitions: true },
  })
  // Tags the AI invents need a definition or they render unstyled — collected across
  // the whole batch so the channel row is written once, not once per card.
  const tagDefs = [...(channel?.tagDefinitions ?? [])]
  let tagDefsChanged = false

  for (const mod of modifications) {
    const existing = await db.query.cards.findFirst({ where: eq(cards.id, mod.id) })
    // The planner can hallucinate ids, and cards can be deleted mid-run
    if (!existing || existing.channelId !== channelId) continue

    const now = new Date()
    const updates: Partial<typeof cards.$inferInsert> = { updatedAt: now }

    if (mod.title && mod.title !== existing.title) updates.title = mod.title

    if (mod.content) {
      updates.messages = [
        ...(existing.messages ?? []),
        {
          id: nanoid(),
          type: 'ai_response' as const,
          content: mod.content,
          createdAt: now.toISOString(),
        },
      ] as typeof cards.$inferInsert.messages
    }

    if (mod.tags?.length) {
      const current = existing.tags ?? []
      const merged = [...current]
      for (const raw of mod.tags) {
        const tag = raw.trim()
        if (!tag) continue
        if (!merged.includes(tag)) merged.push(tag)
        if (!tagDefs.some((d) => d.name === tag)) {
          tagDefs.push({ id: nanoid(), name: tag, color: TAG_COLORS[tagDefs.length % TAG_COLORS.length] })
          tagDefsChanged = true
        }
      }
      if (merged.length !== current.length) updates.tags = merged
    }

    if (mod.properties?.length) {
      const merged = [...(existing.properties ?? [])]
      for (const prop of mod.properties) {
        const at = merged.findIndex((p) => p.key === prop.key)
        const next = {
          key: prop.key,
          value: prop.value,
          displayType: prop.displayType ?? ('chip' as const),
          color: prop.color,
        }
        if (at >= 0) merged[at] = next
        else merged.push(next)
      }
      updates.properties = merged
    }

    const assignees = memberIds ? mod.assignedTo?.filter((id) => memberIds.has(id)) : mod.assignedTo
    if (assignees?.length) updates.assignedTo = assignees

    updates.processedByInstructions = {
      ...(existing.processedByInstructions ?? {}),
      [instructionCardId]: now.toISOString(),
    }

    await db.update(cards).set(updates).where(eq(cards.id, mod.id))
    modifiedCardIds.push(mod.id)

    if (mod.tasks?.length) {
      tasksCreated += await createCardTasks(channelId, mod.id, mod.tasks, memberIds)
    }
  }

  if (tagDefsChanged) {
    await db.update(channels).set({ tagDefinitions: tagDefs, updatedAt: new Date() }).where(eq(channels.id, channelId))
  }

  return { modifiedCardIds, tasksCreated }
}

/** Adds tasks under a card, skipping ones whose title already exists there. */
async function createCardTasks(
  channelId: string,
  cardId: string,
  incoming: { title: string; description?: string; assignedTo?: string[] }[],
  memberIds: Set<string> | null
): Promise<number> {
  const existing = await db.query.tasks.findMany({
    where: eq(tasks.cardId, cardId),
    orderBy: [desc(tasks.position)],
  })
  const seen = new Set(existing.map((t) => t.title.toLowerCase().trim()))
  let nextPosition = (existing.length > 0 ? existing[0].position : -1) + 1
  let created = 0

  for (const task of incoming) {
    const title = task.title?.trim()
    if (!title || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())

    const assignees = memberIds ? task.assignedTo?.filter((id) => memberIds.has(id)) : task.assignedTo
    const now = new Date()

    await db.insert(tasks).values({
      id: nanoid(),
      channelId,
      cardId,
      title,
      description: task.description ?? '',
      status: 'not_started',
      assignedTo: assignees?.length ? assignees : null,
      position: nextPosition++,
      createdAt: now,
      updatedAt: now,
    })
    created++
  }

  return created
}

export interface ApplyMovesResult {
  movedCardIds: string[]
}

/**
 * Write a `move` shroom's decisions.
 *
 * Cards land at the top of the destination's active bucket, matching what the board does
 * when it applies a move locally. Positions only need to be ordered, not contiguous, so
 * taking `min - 1` places a card first without rewriting every sibling row.
 */
export async function applyShroomMoves(options: {
  channelId: string
  instructionCardId: string
  moves: { cardId: string; destinationColumnId: string }[]
}): Promise<ApplyMovesResult> {
  const { channelId, instructionCardId, moves } = options
  const movedCardIds: string[] = []

  // Several cards moving to one column must stack rather than share a position
  const nextTopByColumn = new Map<string, number>()

  for (const move of moves) {
    const existing = await db.query.cards.findFirst({ where: eq(cards.id, move.cardId) })
    if (!existing || existing.channelId !== channelId) continue
    if (existing.columnId === move.destinationColumnId) continue

    let position = nextTopByColumn.get(move.destinationColumnId) ?? NaN
    if (Number.isNaN(position)) {
      const top = await db.query.cards.findMany({
        where: inColumnBucket(move.destinationColumnId, 'active'),
        orderBy: [asc(cards.position)],
        limit: 1,
      })
      position = (top.length > 0 ? top[0].position : 0) - 1
    }
    nextTopByColumn.set(move.destinationColumnId, position - 1)

    const now = new Date()
    await db
      .update(cards)
      .set({
        columnId: move.destinationColumnId,
        position,
        processedByInstructions: {
          ...(existing.processedByInstructions ?? {}),
          [instructionCardId]: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(cards.id, move.cardId))

    movedCardIds.push(move.cardId)
  }

  return { movedCardIds }
}

export interface ReportPayload {
  headline: string
  highlights: { text: string; cardIds?: string[] }[]
  summary?: string
}

/**
 * Write a `report` shroom's output as a single card.
 *
 * Deliberately one card per run, not N. It uses the existing widget-card system
 * (`cardType` / `typeData`, schema.ts) so reports inherit archiving, sharing, search and
 * digests for free rather than needing a parallel surface. Reports go straight to the
 * board — there's nothing to approve, and holding an observation in a review queue would
 * make it stale before you read it.
 */
export async function createShroomReport(options: {
  channelId: string
  columnId: string
  instructionCardId: string
  instructionTitle: string
  report: ReportPayload
}): Promise<{ cardId: string; title: string }> {
  const { channelId, columnId, instructionCardId, instructionTitle, report } = options

  const existing = await db.query.cards.findMany({
    where: inColumnBucket(columnId, 'active'),
    orderBy: [desc(cards.position)],
    limit: 1,
  })
  const position = (existing.length > 0 ? existing[0].position : -1) + 1

  const cardId = nanoid()
  const now = new Date()
  const nowIso = now.toISOString()

  // Render the body as markdown so it reads well in the card thread, which already
  // renders markdown via ReactMarkdown.
  const body = [
    ...report.highlights.map((h) => `- ${h.text}`),
    report.summary ? `\n${report.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  await db.insert(cards).values({
    id: cardId,
    channelId,
    columnId,
    title: report.headline,
    messages: [
      {
        id: nanoid(),
        type: 'ai_response' as const,
        content: body || '_Nothing noteworthy to report._',
        createdAt: nowIso,
      },
    ] as typeof cards.$inferInsert.messages,
    source: 'ai',
    position,
    cardType: 'report',
    typeData: {
      instructionId: instructionCardId,
      instructionTitle,
      generatedAt: nowIso,
      highlights: report.highlights,
    },
    createdByInstructionId: instructionCardId,
    createdAt: now,
    updatedAt: now,
  })

  return { cardId, title: report.headline }
}
