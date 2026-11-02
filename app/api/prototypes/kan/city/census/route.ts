import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { censusFor } from '@/lib/kan/city/census'

export const runtime = 'nodejs'

/** GET — everyone who works for you: each channel's resident, and the staff without a building. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  return Response.json(await censusFor(session.user.id))
}
