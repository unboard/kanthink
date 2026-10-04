import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { printPresets } from '@/lib/db/schema'
import { printUser } from '@/lib/print/server/store'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.delete(printPresets).where(and(eq(printPresets.id, id), eq(printPresets.userId, userId)))
  return NextResponse.json({ ok: true })
}
