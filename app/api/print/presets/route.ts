import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { printPresets } from '@/lib/db/schema'
import { validateSpec } from '@/lib/print/spec'
import { listPresets, now, printUser } from '@/lib/print/server/store'

/** GET → saved canvas sizes. POST { name, spec } → save one. */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ presets: await listPresets(userId) })
}

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const spec = validateSpec(body?.spec)
  if (!spec) return NextResponse.json({ error: 'That size doesn’t look right.' }, { status: 400 })
  const name = (typeof body?.name === 'string' && body.name.trim()) || spec.name
  const id = nanoid(12)
  const saved = { ...spec, id: `preset:${id}`, name: name.slice(0, 80) }
  await db.insert(printPresets).values({ id, userId, name: saved.name, spec: JSON.stringify(saved), createdAt: now() })
  return NextResponse.json({ preset: { id, name: saved.name, spec: saved } })
}
