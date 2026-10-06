import { NextRequest, NextResponse } from 'next/server'
import { sweepDeadlines } from '@/lib/print/orders/server'

/**
 * GET /api/cron/print-orders — hourly. Locks every open job whose deadline has passed,
 * so the "locked" webhook fires near the deadline rather than on the next page view.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ locked: await sweepDeadlines() })
}
