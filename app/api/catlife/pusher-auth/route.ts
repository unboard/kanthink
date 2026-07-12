/**
 * Pusher auth for Whisker Wilds "playdate" rooms.
 *
 * Unlike the main Kanthink auth endpoint, this authorizes ANONYMOUS players:
 * the kids' tablets play /catlife without Kanthink accounts, and the room
 * code (shared out-of-band between siblings) is the only secret. Scoped
 * strictly to presence-playdate-* channels so it can't touch board data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticatePresence, isPusherConfigured, getUserColor } from '@/lib/sync/pusherServer'

const CHANNEL_RE = /^presence-playdate-[A-Z0-9]{4,12}$/

export async function POST(request: NextRequest) {
  if (!isPusherConfigured()) {
    return NextResponse.json({ error: 'Pusher not configured' }, { status: 503 })
  }

  const formData = await request.formData()
  const socketId = formData.get('socket_id') as string
  const pusherChannel = formData.get('channel_name') as string
  const catName = ((formData.get('cat_name') as string) || 'A cat').slice(0, 24)
  const playerId = ((formData.get('player_id') as string) || '').slice(0, 40)

  if (!socketId || !pusherChannel) {
    return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 })
  }
  if (!CHANNEL_RE.test(pusherChannel)) {
    return NextResponse.json({ error: 'Only playdate channels allowed here' }, { status: 403 })
  }

  const id = /^[a-zA-Z0-9_-]{8,40}$/.test(playerId)
    ? playerId
    : `guest-${crypto.randomUUID()}`

  try {
    const authResponse = authenticatePresence(socketId, pusherChannel, {
      id,
      name: catName,
      image: null,
      color: getUserColor(id),
    })
    return NextResponse.json(authResponse)
  } catch (error) {
    console.error('[Playdate Auth] Failed:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
