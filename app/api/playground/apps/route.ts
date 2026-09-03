import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards, playgroundApps } from '@/lib/db/schema'
import { eq, and, asc, sql } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { signAppToken } from '@/lib/playground/appToken'

export const runtime = 'nodejs'

/**
 * Playground apps hanging off a card.
 *
 * GET  /api/playground/apps?cardId=…   list the card's apps
 * POST /api/playground/apps            create an empty app on a card
 *
 * A new app has no code — it is a thread with its source card pinned at the top,
 * waiting for a brief. The first build is an ordinary generate call; nothing here
 * calls Gemini, so creating an app is free and instant.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const cardId = req.nextUrl.searchParams.get('cardId')
  if (!cardId) {
    return NextResponse.json({ error: 'cardId is required' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) })
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }
    await requirePermission(card.channelId, session.user.id, 'view')

    const apps = await db.query.playgroundApps.findMany({
      where: and(eq(playgroundApps.cardId, cardId), eq(playgroundApps.isArchived, false)),
      orderBy: [asc(playgroundApps.position), asc(playgroundApps.createdAt)],
    })

    return NextResponse.json({ apps })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load apps' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { cardId?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.cardId) {
    return NextResponse.json({ error: 'cardId is required' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const card = await db.query.cards.findFirst({ where: eq(cards.id, body.cardId) })
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }
    await requirePermission(card.channelId, session.user.id, 'edit')

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(playgroundApps)
      .where(eq(playgroundApps.cardId, card.id))

    const id = crypto.randomUUID()
    const now = new Date()
    const app = {
      id,
      channelId: card.channelId,
      cardId: card.id,
      title: (body.title || '').trim() || 'New app',
      // Minted up front so the iframe can authenticate even before the first build.
      appToken: signAppToken(id),
      position: Number(count) || 0,
      createdBy: session.user.id,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(playgroundApps).values(app)

    const created = await db.query.playgroundApps.findFirst({
      where: eq(playgroundApps.id, id),
    })

    return NextResponse.json({ app: created })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps] POST failed:', error)
    return NextResponse.json({ error: 'Failed to create app' }, { status: 500 })
  }
}
