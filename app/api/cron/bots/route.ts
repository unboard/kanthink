import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { runDueBots } from '@/lib/kan/bots/run'

export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * GET /api/cron/bots
 *
 * Hourly. Runs every enabled channel bot whose next run is due, one at a time,
 * stopping short of the function's ceiling; whatever's left runs next hour.
 *
 * Fails closed on CRON_SECRET — bots email people, publish and set prices.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureSchema()
  return NextResponse.json(await runDueBots())
}
