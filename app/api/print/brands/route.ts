import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { printBrands } from '@/lib/db/schema'
import { isOwnImageUrl } from '@/lib/print/server/images'
import { cleanBrandKit, listBrands, now, printUser, toBrand } from '@/lib/print/server/store'

/** GET → brand kits. POST { name, data } → a new kit. */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ brands: await listBrands(userId) })
}

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const data = cleanBrandKit(body?.data, isOwnImageUrl)
  const name = (typeof body?.name === 'string' && body.name.trim()) || data.details.business || 'My brand'
  const at = now()
  const [row] = await db
    .insert(printBrands)
    .values({ id: nanoid(12), userId, name: name.slice(0, 120), data: JSON.stringify(data), createdAt: at, updatedAt: at })
    .returning()
  return NextResponse.json({ brand: toBrand(row) })
}
