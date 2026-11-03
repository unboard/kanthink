import { kanwatchUser } from '@/lib/kanwatch/access'
import { freewayFor } from '@/lib/kanwatch/freeway'

export const runtime = 'nodejs'

/** GET — your Kanwatch days as a road: each day's building and the billboards between. */
export async function GET() {
  const userId = await kanwatchUser()
  if (!userId) return Response.json({ error: 'Not available' }, { status: 403 })
  return Response.json(await freewayFor(userId))
}
