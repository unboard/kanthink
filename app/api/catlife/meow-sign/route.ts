/**
 * Whisker Wilds recorded meows.
 *
 * POST → short-lived Cloudinary signature so the kid's tablet can upload a
 * tiny meow recording directly (auth via the catlife bearer token, same as
 * the cloud-save routes — no Kanthink login on the kids' tablets).
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { catlifePlayers } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { isCloudinaryConfigured, signVideoUpload } from '@/lib/cloudinary'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  await ensureSchema()
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  const rows = await db.select().from(catlifePlayers)
    .where(eq(catlifePlayers.token, token)).limit(1)
  const player = rows[0]
  if (!player) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Meow storage is not configured.' }, { status: 500 })
  }
  return NextResponse.json(signVideoUpload({ folder: `kanthink/catlife-meows/${player.id}` }))
}
