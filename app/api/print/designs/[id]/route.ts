import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { printDesigns } from '@/lib/db/schema'
import { isOwnImageUrl } from '@/lib/print/server/images'
import { getDesign, now, printUser } from '@/lib/print/server/store'
import type { ChatMessage, PrintBrief, PrintPage } from '@/lib/print/types'

/**
 * GET → the design. PATCH { name?, pages?, brief?, brandId? } → save. DELETE → gone.
 *
 * The studio is the single writer of a design's pages: renders return versions, and the
 * studio decides where they go and saves the result. Renders and spend are counted by
 * the render route itself, atomically, and are not writable here.
 */

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const design = await getDesign(userId, id)
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ design })
}

function cleanPages(input: unknown, count: number): PrintPage[] | null {
  if (!Array.isArray(input) || input.length !== count) return null
  const pages: PrintPage[] = []
  for (const p of input as PrintPage[]) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.versions)) return null
    const versions = p.versions
      .filter((v) => v && typeof v.url === 'string' && typeof v.rawUrl === 'string')
      .filter((v) => (isOwnImageUrl(v.url) || v.url.startsWith('data:')) && (isOwnImageUrl(v.rawUrl) || v.rawUrl.startsWith('data:')))
      .slice(-40)
    pages.push({
      id: p.id.slice(0, 40),
      label: String(p.label ?? '').slice(0, 40),
      versions,
      current: Math.max(0, Math.min(versions.length - 1, Number(p.current) || 0)),
    })
  }
  return pages
}

function cleanBrief(input: unknown): PrintBrief | null {
  if (!input || typeof input !== 'object') return null
  const b = input as Partial<PrintBrief>
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 24) : [])
  return {
    prompt: typeof b.prompt === 'string' ? b.prompt.slice(0, 4000) : undefined,
    useLogo: b.useLogo !== false,
    useColors: b.useColors !== false,
    useDetails: b.useDetails !== false,
    assetIds: ids(b.assetIds),
    inspirationIds: ids(b.inspirationIds),
    modelId: typeof b.modelId === 'string' ? b.modelId.slice(0, 80) : undefined,
    quality: b.quality === 'draft' ? 'draft' : 'print',
  }
}

function cleanChat(input: unknown[]): ChatMessage[] {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return input
    .filter((m): m is ChatMessage => !!m && typeof m === 'object' && ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'kan'))
    .slice(-80)
    .map((m) => ({
      id: str(m.id, 40) || Math.random().toString(36).slice(2, 10),
      role: m.role,
      text: str(m.text, 4000),
      images: Array.isArray(m.images)
        ? m.images.filter((i) => i && typeof i.url === 'string' && isOwnImageUrl(i.url)).slice(0, 6).map((i) => ({ url: i.url, label: str(i.label, 40), pageIndex: Number(i.pageIndex) || 0 }))
        : undefined,
      suggestions: Array.isArray(m.suggestions) ? m.suggestions.map((s) => str(s, 80)).filter(Boolean).slice(0, 4) : undefined,
      at: Number(m.at) || 0,
    }))
}

export async function PATCH(request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const design = await getDesign(userId, id)
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const set: Partial<typeof printDesigns.$inferInsert> = { updatedAt: now() }
  if (typeof body.name === 'string' && body.name.trim()) set.name = body.name.trim().slice(0, 120)
  if ('brandId' in body) set.brandId = typeof body.brandId === 'string' ? body.brandId : null
  if (body.brief !== undefined) {
    const brief = cleanBrief(body.brief)
    if (brief) set.brief = JSON.stringify(brief)
  }
  if (Array.isArray(body.chat)) set.chat = JSON.stringify(cleanChat(body.chat))
  if (body.pages !== undefined) {
    const pages = cleanPages(body.pages, design.spec.pages.length)
    if (!pages) return NextResponse.json({ error: 'Pages don’t match this design.' }, { status: 400 })
    set.pages = JSON.stringify(pages)
  }
  await db.update(printDesigns).set(set).where(and(eq(printDesigns.id, id), eq(printDesigns.userId, userId)))
  return NextResponse.json({ ok: true, updatedAt: set.updatedAt })
}

export async function DELETE(_request: Request, { params }: Params) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.delete(printDesigns).where(and(eq(printDesigns.id, id), eq(printDesigns.userId, userId)))
  return NextResponse.json({ ok: true })
}
