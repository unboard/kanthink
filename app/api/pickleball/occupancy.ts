/**
 * Who is sitting in a pickleball room right now, read from Pusher's presence API.
 * Rooms have no database rows: the presence channel IS the room, and member ids carry
 * the seat (h_… host, g_… guest). Same env vars as lib/sync/pusherServer.ts.
 */

import Pusher from 'pusher'
import { channelForRoom, roleOfMember } from '@/app/pickleball/room'

let client: Pusher | null = null

function getClient(): Pusher | null {
  if (client) return client
  const appId = process.env.PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!appId || !key || !secret || !cluster) return null
  client = new Pusher({ appId, key, secret, cluster, useTLS: true })
  return client
}

export interface Occupancy {
  host: string | null
  guest: string | null
  count: number
}

export async function roomOccupancy(code: string): Promise<Occupancy | null> {
  const pusher = getClient()
  if (!pusher) return null
  const res = await pusher.get({ path: `/channels/${channelForRoom(code)}/users` })
  if (!res.ok) throw new Error(`Pusher users lookup failed: ${res.status}`)
  const body = (await res.json()) as { users?: { id: string }[] }
  const users = body.users ?? []
  let host: string | null = null
  let guest: string | null = null
  for (const u of users) {
    const role = roleOfMember(u.id)
    if (role === 'host' && !host) host = u.id
    if (role === 'guest' && !guest) guest = u.id
  }
  return { host, guest, count: users.length }
}
