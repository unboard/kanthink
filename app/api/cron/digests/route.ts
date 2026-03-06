import { NextRequest, NextResponse } from 'next/server'
import { processDigests } from '@/lib/digests/generate'

/**
 * GET /api/cron/digests
 * Daily cron endpoint. Processes daily subs every run,
 * weekly on Mondays, monthly on 1st.
 * Protected by CRON_SECRET header (Vercel auto-sends).
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sunday, 1=Monday
  const dayOfMonth = now.getUTCDate()

  const results: Record<string, unknown[]> = {}

  // Always process daily
  results.daily = await processDigests('daily')

  // Weekly on Mondays
  if (dayOfWeek === 1) {
    results.weekly = await processDigests('weekly')
  }

  // Monthly on 1st
  if (dayOfMonth === 1) {
    results.monthly = await processDigests('monthly')
  }

  const totalSent = Object.values(results)
    .flat()
    .filter((r: unknown) => (r as { sent: boolean }).sent).length

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    totalSent,
    results,
  })
}
