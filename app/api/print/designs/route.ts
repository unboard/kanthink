import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { printDesigns } from '@/lib/db/schema'
import { validateSpec } from '@/lib/print/spec'
import { listDesigns, now, printUser, toDesign } from '@/lib/print/server/store'
import { DEFAULT_BRIEF, type PrintPage } from '@/lib/print/types'

/** GET → this user's designs, newest first. POST { name, spec, brandId? } → a new design. */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Sign in to use the print studio.' }, { status: 401 })
  const designs = await listDesigns(userId)
  return NextResponse.json({ designs })
}

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Sign in to use the print studio.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const spec = validateSpec(body?.spec)
  if (!spec) return NextResponse.json({ error: 'That size doesn’t look right.' }, { status: 400 })

  const pages: PrintPage[] = spec.pages.map((p) => ({ id: nanoid(8), label: p.label, versions: [], current: 0 }))
  const at = now()
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : `Untitled ${spec.name.toLowerCase()}`
  const [row] = await db
    .insert(printDesigns)
    .values({
      id: nanoid(12),
      userId,
      name,
      spec: JSON.stringify(spec),
      brandId: typeof body?.brandId === 'string' ? body.brandId : null,
      brief: JSON.stringify(DEFAULT_BRIEF),
      pages: JSON.stringify(pages),
      renders: 0,
      spendCents: 0,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return NextResponse.json({ design: toDesign(row) })
}
