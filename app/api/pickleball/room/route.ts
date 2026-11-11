/**
 * Pickleball rooms.
 *   POST              → { code } a fresh, unoccupied room code for a host
 *   GET ?code=XXXX    → { status: 'open' | 'full' | 'missing' } before a guest joins
 *
 * Anonymous by design, like the Whisker Wilds playdates: the room code is the only
 * secret, and the channels are scoped to presence-pickleball-* so they can't reach
 * board data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { isPusherConfigured } from '@/lib/sync/pusherServer'
import { makeRoomCode, normalizeRoomCode } from '@/app/pickleball/room'
import { roomOccupancy } from '../occupancy'

const NOT_CONFIGURED = {
  error: 'Online play needs the realtime service, and it is not set up here. Practice mode still works.',
}

export async function POST() {
  if (!isPusherConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 })
  try {
    for (let i = 0; i < 6; i++) {
      const code = makeRoomCode()
      const occ = await roomOccupancy(code)
      if (occ && occ.count === 0) return NextResponse.json({ code })
    }
    return NextResponse.json({ error: 'Could not find a free room. Try again.' }, { status: 503 })
  } catch (error) {
    console.error('[Pickleball] create room failed:', error)
    return NextResponse.json({ error: 'Could not reach the realtime service.' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  if (!isPusherConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 })
  const code = normalizeRoomCode(request.nextUrl.searchParams.get('code') ?? '')
  if (!code) {
    return NextResponse.json({ error: 'Room codes are four letters, like HKTP.' }, { status: 400 })
  }
  try {
    const occ = await roomOccupancy(code)
    if (!occ || !occ.host) return NextResponse.json({ code, status: 'missing' })
    if (occ.guest) return NextResponse.json({ code, status: 'full' })
    return NextResponse.json({ code, status: 'open' })
  } catch (error) {
    console.error('[Pickleball] room lookup failed:', error)
    return NextResponse.json({ error: 'Could not reach the realtime service.' }, { status: 502 })
  }
}
