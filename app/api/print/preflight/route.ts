import { NextResponse } from 'next/server'
import { cleanCopy } from '@/lib/print/server/understand'
import { isOwnImageUrl } from '@/lib/print/server/images'
import { RenderError, preflight } from '@/lib/print/server/pipeline'
import { getBrand, getDesign, printUser } from '@/lib/print/server/store'
import type { PrintVersion } from '@/lib/print/types'

/** POST { designId, version } → the print check for that page version. */

export const maxDuration = 120

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const v = body?.version as PrintVersion | undefined
  if (!body || typeof body.designId !== 'string' || !v || typeof v.url !== 'string' || !(isOwnImageUrl(v.url) || v.url.startsWith('data:image/'))) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const design = await getDesign(userId, body.designId)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
  const brand = await getBrand(userId, design.brandId)
  try {
    const result = await preflight(userId, design, { ...v, copy: v.copy ? cleanCopy(v.copy) : undefined }, brand?.data ?? null)
    return NextResponse.json({ check: result })
  } catch (err) {
    const status = err instanceof RenderError ? err.status : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Check failed' }, { status })
  }
}
