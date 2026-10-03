/**
 * Clean Cut leaderboard.
 *
 * GET  ?mode=daily&day=YYYY-MM-DD → today's top days + the all-time board
 * POST { name, mode, day, money, jobs, style, quality } → record a finished day
 *
 * No accounts: a name per device. Scores are sanity-capped so a tampered client
 * can't post something no real day could earn.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { mowScores } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const NAME_RE = /^[\p{L}\p{N} ._'-]{1,18}$/u
const MAX_MONEY = 6000

function row(r: typeof mowScores.$inferSelect) {
  return { name: r.name, day: r.day, mode: r.mode, money: r.money, jobs: r.jobs, style: r.style ?? 0, quality: r.quality ?? 0, at: r.createdAt ?? 0 }
}

export async function GET(request: NextRequest) {
  await ensureSchema()
  const mode = request.nextUrl.searchParams.get('mode') === 'free' ? 'free' : 'daily'
  const day = request.nextUrl.searchParams.get('day') ?? ''
  const today = DAY_RE.test(day) && mode === 'daily'
    ? await db.select().from(mowScores).where(and(eq(mowScores.mode, 'daily'), eq(mowScores.day, day))).orderBy(desc(mowScores.money)).limit(25)
    : []
  const allTime = await db.select().from(mowScores).where(eq(mowScores.mode, mode)).orderBy(desc(mowScores.money)).limit(25)
  return NextResponse.json({ today: today.map(row), allTime: allTime.map(row) })
}

export async function POST(request: NextRequest) {
  await ensureSchema()
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const name = String(body.name ?? '').trim()
  const mode = body.mode === 'free' ? 'free' : 'daily'
  const day = mode === 'daily' ? String(body.day ?? '') : 'free'
  const money = Math.round(Number(body.money))
  const jobs = Math.round(Number(body.jobs))
  const style = Math.round(Number(body.style) || 0)
  const quality = Math.round(Number(body.quality) || 0)
  if (!NAME_RE.test(name)) return NextResponse.json({ error: 'Pick a name (letters and numbers, up to 18)' }, { status: 400 })
  if (mode === 'daily' && !DAY_RE.test(day)) return NextResponse.json({ error: 'Bad day' }, { status: 400 })
  if (!Number.isFinite(money) || money < 0 || money > MAX_MONEY) return NextResponse.json({ error: 'Bad score' }, { status: 400 })
  if (!Number.isFinite(jobs) || jobs < 0 || jobs > 7) return NextResponse.json({ error: 'Bad score' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  await db.insert(mowScores).values({
    name,
    day,
    mode,
    money,
    jobs,
    style: Math.max(0, Math.min(10000, style)),
    quality: Math.max(0, Math.min(100, quality)),
    createdAt: now,
  })
  return NextResponse.json({ ok: true })
}
