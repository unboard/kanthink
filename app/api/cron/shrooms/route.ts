import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { isScheduledTriggerDue, calculateNextScheduledRun } from '@/lib/automationSafeguards'
import { runShroomServerSide, rowToInstructionCard } from '@/lib/shrooms/runServerSide'
import type { AutomaticTrigger, ScheduledTrigger } from '@/lib/types'

/**
 * GET /api/cron/shrooms
 *
 * Runs scheduled shrooms server-side.
 *
 * Automation used to live entirely in AutomationProvider's 60s poll, which only ticks
 * while a browser tab is open — a shroom that only runs when you're watching its board
 * isn't doing much for you. This is what lets one work overnight.
 *
 * Generated cards land in the review bucket (unless the shroom is set to auto-approve),
 * so waking up to shroom output means a badge to work through, not a cluttered board.
 *
 * The actual running lives in lib/shrooms/runServerSide.ts, shared with the event-trigger
 * path so a scheduled run and a card-triggered one behave identically.
 *
 * Protected by CRON_SECRET (Vercel sends it automatically).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Fails closed, unlike the digests cron. This endpoint spends LLM tokens, so an
  // unset secret must mean "nobody can call this", not "anybody can".
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured — refusing to run' },
      { status: 503 }
    )
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json(
      { error: 'INTERNAL_API_SECRET is not configured — cron cannot run shrooms' },
      { status: 500 }
    )
  }

  await ensureSchema()

  const results: { id: string; title: string; status: string; detail?: string }[] = []

  // Only enabled shrooms can be scheduled; everything else is manual-only.
  const candidates = await db.query.instructionCards.findMany({
    where: eq(instructionCards.isEnabled, true),
  })

  for (const row of candidates) {
    const instruction = rowToInstructionCard(row)

    const scheduled = (instruction.triggers ?? []).find(
      (t: AutomaticTrigger) => t.type === 'scheduled'
    ) as ScheduledTrigger | undefined

    if (!scheduled) continue
    if (!isScheduledTriggerDue(instruction.nextScheduledRun)) continue

    const result = await runShroomServerSide({
      instruction,
      triggerType: 'scheduled',
      nextScheduledRun: calculateNextScheduledRun(
        scheduled.interval,
        scheduled.specificTime,
        scheduled.dayOfWeek
      ),
    })

    results.push({
      id: instruction.id,
      title: instruction.title,
      status: result.status,
      detail: result.detail,
    })
  }

  return NextResponse.json({
    checked: candidates.length,
    ran: results.filter((r) => r.status === 'ran').length,
    results,
  })
}
