/**
 * Whisker Wilds cloud save sync.
 *
 * GET  → the signed-in kid's save (token in Authorization: Bearer <token>)
 * PUT  → store the save JSON (last write wins; the client compares savedAt
 *        timestamps on boot so the newest progress always survives)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { catlifePlayers } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'

async function playerFromToken(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || token.length < 20) return null
  const rows = await db.select().from(catlifePlayers)
    .where(eq(catlifePlayers.token, token)).limit(1)
  return rows[0] ?? null
}

export async function GET(request: NextRequest) {
  await ensureSchema()
  const player = await playerFromToken(request)
  if (!player) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let save: unknown = null
  if (player.saveData) {
    try { save = JSON.parse(player.saveData) } catch { save = null }
  }
  return NextResponse.json({ save, saveUpdatedAt: player.saveUpdatedAt ?? null, username: player.username })
}

export async function PUT(request: NextRequest) {
  await ensureSchema()
  const player = await playerFromToken(request)
  if (!player) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { save?: { v?: number; cats?: unknown[] } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const save = body.save
  // minimal shape check so a glitchy client can't wipe a good save with junk
  if (!save || save.v !== 1 || !Array.isArray(save.cats) || save.cats.length === 0) {
    return NextResponse.json({ error: 'Invalid save' }, { status: 400 })
  }
  const raw = JSON.stringify(save)
  if (raw.length > 1_000_000) {
    return NextResponse.json({ error: 'Save too large' }, { status: 413 })
  }
  const now = Math.floor(Date.now() / 1000)
  await db.update(catlifePlayers)
    .set({ saveData: raw, saveUpdatedAt: now })
    .where(eq(catlifePlayers.id, player.id))
  return NextResponse.json({ ok: true, saveUpdatedAt: now })
}
