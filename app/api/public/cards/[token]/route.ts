import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cards, channels, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ token: string }>
}

/**
 * GET /api/public/cards/:token
 * Get a publicly shared card (no auth required)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { token } = await params

  const card = await db.query.cards.findFirst({
    where: and(
      eq(cards.shareToken, token),
      eq(cards.isPublic, true)
    ),
  })

  if (!card) {
    return NextResponse.json({ error: 'Card not found or not public' }, { status: 404 })
  }

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, card.channelId),
    columns: { name: true, ownerId: true },
  })

  const owner = channel?.ownerId
    ? await db.query.users.findFirst({
        where: eq(users.id, channel.ownerId),
        columns: { name: true, image: true },
      })
    : null

  return NextResponse.json({
    card: {
      id: card.id,
      title: card.title,
      messages: card.messages,
      coverImageUrl: card.coverImageUrl,
      summary: card.summary,
      tags: card.tags,
      source: card.source,
      createdAt: card.createdAt?.toISOString(),
    },
    channel: channel ? { name: channel.name } : null,
    author: owner ? { name: owner.name, image: owner.image } : null,
  })
}
