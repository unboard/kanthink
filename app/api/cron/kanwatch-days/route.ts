import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { writeFinishedDays } from '@/lib/kanwatch/endOfDay'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/kanwatch-days
 *
 * Hourly. Writes Kan's read on each Kanwatch day that has ended (and its Freeway
 * board), once. Hourly rather than at midnight because each person's midnight is
 * their own.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return NextResponse.json(await writeFinishedDays())
}
