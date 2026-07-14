/**
 * Whisker Wilds kid accounts: signup + login.
 *
 * Deliberately simple — a username and password a 7-9 year old can manage,
 * with a parent email stored for recovery. Completely separate from Kanthink
 * users/NextAuth. Error messages are written for kids reading them on a tablet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { catlifePlayers } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'

const USERNAME_RE = /^[a-z0-9_]{2,20}$/

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function POST(request: NextRequest) {
  await ensureSchema()

  let body: { action?: string; username?: string; password?: string; parentEmail?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const action = body.action
  const username = (body.username ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Pick a name with 2-20 letters or numbers (no spaces).' },
      { status: 400 }
    )
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: 'Your secret word needs at least 4 letters.' },
      { status: 400 }
    )
  }

  if (action === 'signup') {
    const existing = await db.select({ id: catlifePlayers.id })
      .from(catlifePlayers).where(eq(catlifePlayers.username, username)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'That name is already taken — try another one!' },
        { status: 409 }
      )
    }
    const token = randomBytes(24).toString('hex')
    const now = Math.floor(Date.now() / 1000)
    await db.insert(catlifePlayers).values({
      username,
      passwordHash: hashPassword(password),
      parentEmail: (body.parentEmail ?? '').trim().slice(0, 120) || null,
      token,
      createdAt: now,
    })
    return NextResponse.json({ token, username, save: null })
  }

  if (action === 'login') {
    const rows = await db.select().from(catlifePlayers)
      .where(eq(catlifePlayers.username, username)).limit(1)
    const player = rows[0]
    if (!player || !verifyPassword(password, player.passwordHash)) {
      return NextResponse.json(
        { error: "That name and secret word don't match. Ask a grown-up for help!" },
        { status: 401 }
      )
    }
    // keep the existing token so a sister's tablet stays signed in too
    let token = player.token
    if (!token) {
      token = randomBytes(24).toString('hex')
      await db.update(catlifePlayers).set({ token }).where(eq(catlifePlayers.id, player.id))
    }
    let save: unknown = null
    if (player.saveData) {
      try { save = JSON.parse(player.saveData) } catch { save = null }
    }
    return NextResponse.json({
      token,
      username,
      save,
      saveUpdatedAt: player.saveUpdatedAt ?? null,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
