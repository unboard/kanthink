import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { runStudioMorning } from '@/lib/studio/daily'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/studio
 *
 * Once a day, after the shroom cron has sent the scouts out: draft (or send) the
 * follow-ups, and email each Studio owner the morning spark.
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
      results.push(await runStudioMorning(studio))
    } catch (error) {
      console.error('[cron/studio] failed for', studio.userId, error)
      results.push({ userId: studio.userId, error: error instanceof Error ? error.message : 'failed' })
    }
  }
  return NextResponse.json({ ran: results.length, results })
}
