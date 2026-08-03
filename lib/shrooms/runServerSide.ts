import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { loadChannelForShroom } from '@/lib/shrooms/loadChannelForShroom'
import { checkSafeguards, getExecutionUpdate } from '@/lib/automationSafeguards'
import type { InstructionCard, TriggerType } from '@/lib/types'

export interface ServerRunResult {
  status: 'ran' | 'skipped' | 'failed'
  detail?: string
  cardsAffected: number
}

/** DB row → the InstructionCard shape the planner and safeguards expect. */
export function rowToInstructionCard(row: typeof instructionCards.$inferSelect): InstructionCard {
  return {
    ...row,
    lastExecutedAt: row.lastExecutedAt?.toISOString(),
    nextScheduledRun: row.nextScheduledRun?.toISOString(),
    dailyCountResetAt: row.dailyCountResetAt?.toISOString(),
  } as unknown as InstructionCard
}

/**
 * Run one shroom with no browser involved.
 *
 * Both unattended paths funnel through here — the nightly cron and a card landing in a
 * watched column — so "the shroom ran" means the same thing either way. Safeguards
 * (cooldown, daily cap, loop prevention) are the same pure functions the in-browser
 * engine uses, so a shroom can't dodge its limits by being triggered from a different
 * direction.
 *
 * Never throws. Returns why it didn't run, which the callers log.
 */
export async function runShroomServerSide(options: {
  instruction: InstructionCard
  triggerType: TriggerType
  /** Scope a card-triggered run to the card that set it off. */
  triggeringCardId?: string
  /** Advance nextScheduledRun as well as the usual execution bookkeeping. */
  nextScheduledRun?: Date
}): Promise<ServerRunResult> {
  const { instruction, triggerType, triggeringCardId, nextScheduledRun } = options

  if (!process.env.INTERNAL_API_SECRET) {
    return { status: 'skipped', detail: 'INTERNAL_API_SECRET not configured', cardsAffected: 0 }
  }

  // A run pinned to one card is its own unit of work, so it isn't held back by how
  // recently the shroom last ran on a different card.
  const safeguard = checkSafeguards(instruction, triggerType, undefined, undefined, {
    cardScoped: !!triggeringCardId,
  })
  if (!safeguard.canExecute) {
    await recordSkip(instruction, safeguard.reason ?? 'skipped', triggerType).catch(() => {})
    return { status: 'skipped', detail: safeguard.details ?? safeguard.reason, cardsAffected: 0 }
  }

  const loaded = await loadChannelForShroom(instruction.channelId)
  if (!loaded) {
    return { status: 'skipped', detail: 'channel not found', cardsAffected: 0 }
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'https://kanthink.com'

  try {
    const res = await fetch(`${baseUrl}/api/run-instruction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        instructionCard: instruction,
        channel: loaded.channel,
        cards: loaded.cards,
        tasks: loaded.tasks,
        apply: true,
        skipAlreadyProcessed: true,
        triggeringCardId,
        asUserId: loaded.ownerId,
      }),
    })

    const data = await res.json()
    const succeeded = res.ok && !data.error
    const cardsAffected =
      (data.applied?.cardIds?.length ?? 0) ||
      (data.modifiedCards?.length ?? 0) ||
      (data.movedCards?.length ?? 0)

    await recordRun(instruction, succeeded, cardsAffected, triggerType, nextScheduledRun)

    return {
      status: succeeded ? 'ran' : 'failed',
      detail: succeeded ? `${cardsAffected} card(s)` : data.error,
      cardsAffected,
    }
  } catch (error) {
    console.error(`[shrooms] ${instruction.title} failed:`, error)
    await recordRun(instruction, false, 0, triggerType, nextScheduledRun).catch(() => {})
    return {
      status: 'failed',
      detail: error instanceof Error ? error.message : 'unknown error',
      cardsAffected: 0,
    }
  }
}

/**
 * Note a run that was declined, without counting it as an execution.
 *
 * A skipped run used to leave no trace outside a server log, so a shroom that had hit
 * its daily cap looked identical to one that was broken. This puts the reason where the
 * shroom's own history is.
 */
async function recordSkip(
  instruction: InstructionCard,
  reason: string,
  triggerType: TriggerType
): Promise<void> {
  // Newest first and capped at 10, matching getExecutionUpdate — the two write to the
  // same column, so they have to agree on order or the list reads as shuffled.
  const history = [
    {
      timestamp: new Date().toISOString(),
      triggeredBy: triggerType,
      success: false,
      cardsAffected: 0,
      skippedReason: reason,
    },
    ...(instruction.executionHistory ?? []),
  ].slice(0, 10)

  await db
    .update(instructionCards)
    .set({
      executionHistory: history as {
        timestamp: string
        triggeredBy: 'scheduled' | 'event' | 'threshold'
        success: boolean
        cardsAffected: number
        skippedReason?: string
      }[],
      updatedAt: new Date(),
    })
    .where(eq(instructionCards.id, instruction.id))
}

async function recordRun(
  instruction: InstructionCard,
  succeeded: boolean,
  cardsAffected: number,
  triggerType: TriggerType,
  nextScheduledRun?: Date
): Promise<void> {
  const update = getExecutionUpdate(instruction, succeeded, cardsAffected, triggerType)

  await db
    .update(instructionCards)
    .set({
      lastExecutedAt: update.lastExecutedAt ? new Date(update.lastExecutedAt) : new Date(),
      dailyExecutionCount: update.dailyExecutionCount,
      dailyCountResetAt: update.dailyCountResetAt ? new Date(update.dailyCountResetAt) : new Date(),
      // getExecutionUpdate types its return over the whole TriggerType union, which
      // includes the declared-but-unimplemented 'reaction'. Narrow rather than widen
      // what actually gets stored.
      executionHistory: update.executionHistory as {
        timestamp: string
        triggeredBy: 'scheduled' | 'event' | 'threshold' | 'manual'
        success: boolean
        cardsAffected: number
      }[],
      ...(nextScheduledRun ? { nextScheduledRun } : {}),
      updatedAt: new Date(),
    })
    .where(eq(instructionCards.id, instruction.id))
}
