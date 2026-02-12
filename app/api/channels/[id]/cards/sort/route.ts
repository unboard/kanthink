import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cards } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { requirePermission, PermissionError } from '@/lib/api/permissions'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/channels/:id/cards/sort
 * Set the position of all cards in a column based on an ordered array of card IDs
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id: channelId } = await params
  const userId = session.user.id

  try {
    await requirePermission(channelId, userId, 'edit')

    const body = await req.json()
    const { columnId, cardIds } = body

    if (!columnId || !Array.isArray(cardIds)) {
      return NextResponse.json(
        { error: 'columnId and cardIds array are required' },
        { status: 400 }
      )
    }

    // Update each card's position based on its index in the array
    for (let i = 0; i < cardIds.length; i++) {
      await db
        .update(cards)
        .set({ position: i, updatedAt: new Date() })
        .where(
          and(
            eq(cards.id, cardIds[i]),
            eq(cards.channelId, channelId),
            eq(cards.columnId, columnId)
          )
        )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error sorting cards:', error)
    return NextResponse.json({ error: 'Failed to sort cards' }, { status: 500 })
  }
}
