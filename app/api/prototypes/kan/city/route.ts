import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { cityFor } from '@/lib/kan/city/data'

export const runtime = 'nodejs'

/** GET — your channels as a city, and what's happening in it right now. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json(await cityFor(session.user.id))
}
