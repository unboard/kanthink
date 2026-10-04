import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { printBrands } from '@/lib/db/schema'
import { isOwnImageUrl } from '@/lib/print/server/images'
import { cleanBrandKit, getBrand, now, printUser } from '@/lib/print/server/store'

/** PATCH { name?, data? } → save a brand kit. DELETE → remove it. */

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await getBrand(userId, id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const set: Partial<typeof printBrands.$inferInsert> = { updatedAt: now() }
  if (typeof body.name === 'string' && body.name.trim()) set.name = body.name.trim().slice(0, 120)
  if (body.data) set.data = JSON.stringify(cleanBrandKit(body.data, isOwnImageUrl))
  await db.update(printBrands).set(set).where(and(eq(printBrands.id, id), eq(printBrands.userId, userId)))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.delete(printBrands).where(and(eq(printBrands.id, id), eq(printBrands.userId, userId)))
  return NextResponse.json({ ok: true })
}
