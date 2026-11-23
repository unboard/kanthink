/**
 * Pusher auth for pickleball rooms (presence-pickleball-XXXX).
 *
 * Anonymous, like /api/catlife/pusher-auth: no Kanthink account needed, the room code is
 * the secret. A room holds one host and up to three guests. The member id encodes the
 * role (h_… / g_…), and a place is only granted when one is free, or when the same client
 * is reconnecting to it, so a fifth browser is turned away here even if it skips the lobby.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticatePresence, isPusherConfigured, getUserColor } from '@/lib/sync/pusherServer'
import { CLIENT_ID_RE, MAX_GUESTS, memberId, roomFromChannel, type Role } from '@/app/pickleball/room'
import { roomOccupancy } from '../occupancy'

export async function POST(request: NextRequest) {
  if (!isPusherConfigured()) {
    return NextResponse.json({ error: 'Pusher not configured' }, { status: 503 })
  }

  const formData = await request.formData()
  const socketId = formData.get('socket_id') as string
  const pusherChannel = formData.get('channel_name') as string
  const role = formData.get('role') as Role | null
  const clientId = (formData.get('client_id') as string) || ''
  const name = ((formData.get('name') as string) || '').replace(/[^\p{L}\p{N} '-]/gu, '').slice(0, 16) || 'Player'

  if (!socketId || !pusherChannel) {
    return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 })
  }
  const code = roomFromChannel(pusherChannel)
  if (!code) {
    return NextResponse.json({ error: 'Only pickleball rooms allowed here' }, { status: 403 })
  }
  if (role !== 'host' && role !== 'guest') {
    return NextResponse.json({ error: 'Unknown seat' }, { status: 400 })
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    return NextResponse.json({ error: 'Bad client id' }, { status: 400 })
  }

  const id = memberId(role, clientId)
  try {
    const occ = await roomOccupancy(code)
    const taken = occ
      ? role === 'host'
        ? Boolean(occ.host && occ.host !== id)
        : !occ.guests.includes(id) && occ.guests.length >= MAX_GUESTS
      : false
    if (taken) {
      return NextResponse.json({ error: 'The room is full.' }, { status: 403 })
    }
    if (role === 'guest' && occ && !occ.host) {
      return NextResponse.json({ error: 'No one is hosting that room.' }, { status: 404 })
    }
  } catch (error) {
    // presence lookup is a courtesy check; the clients also enforce two seats
    console.warn('[Pickleball Auth] occupancy check failed:', error)
  }

  try {
    const authResponse = authenticatePresence(socketId, pusherChannel, {
      id,
      name,
      image: null,
      color: getUserColor(id),
    })
    return NextResponse.json(authResponse)
  } catch (error) {
    console.error('[Pickleball Auth] Failed:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
