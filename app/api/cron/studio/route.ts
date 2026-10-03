import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { morningDue, runStudioMorning } from '@/lib/studio/daily'

export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * GET /api/cron/studio
 *
 * Runs hourly; each Studio's morning happens once a day, at 7 AM in its owner's
 * timezone (runStudioMorning decides). The morning makes sure the scout has run
 * today, running it itself if the schedule missed, then audits the sparks, drafts
 * follow-ups and sends the spark email. It doesn't rely on the shroom cron having
 * happened to run first.
 *
 * Fails closed on CRON_SECRET, like the shroom cron — it sends email.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureSchema()
  const studios = await db.query.studioSettings.findMany()
  const results = []
  for (const studio of studios) {
    try {
      if (!(await morningDue(studio))) { results.push({ userId: studio.userId, skipped: 'not this hour' }); continue }
      results.push(await runStudioMorning(studio))
    } catch (error) {
      console.error('[cron/studio] failed for', studio.userId, error)
      results.push({ userId: studio.userId, error: error instanceof Error ? error.message : 'failed' })
    }
  }
  return NextResponse.json({ ran: results.length, results })
}
