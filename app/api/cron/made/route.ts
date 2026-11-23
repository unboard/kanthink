import { NextRequest, NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'

export const runtime = 'nodejs'
// A Neon build can take several minutes.
export const maxDuration = 800

/**
 * GET /api/cron/made
 *
 * Hourly. For everyone with Made for you on, at most once a day each: Kan suggests,
 * ranks (Gemini Decision) and builds (Gemini 4 Neon) one thing for them, within their
 * weekly budget (lib/kan/madeForYou.ts).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { makeForAll } = await import('@/lib/kan/madeForYou')
  return NextResponse.json({ ran: await makeForAll() })
}
