import { NextResponse } from 'next/server'
import { cleanCopy } from '@/lib/print/server/understand'
import { fetchOwnImage, isOwnImageUrl } from '@/lib/print/server/images'
import { RenderError, render } from '@/lib/print/server/pipeline'
import { chargeRender, getBrand, getDesign, printUser } from '@/lib/print/server/store'
import type { PreflightIssue, PrintVersion, VersionMode } from '@/lib/print/types'

/**
 * POST — draw one page version.
 *
 * { designId, pageIndex, mode, prompt?, modelId?, quality?, source?, mask?, copy?, issues? }
 *
 * Returns { version, cents }. The studio places the version and saves the design; this
 * route only counts the render against it.
 */

export const maxDuration = 300

const MODES: VersionMode[] = ['create', 'edit', 'area', 'retext', 'fix', 'upscale', 'fill']

function cleanSource(input: unknown): PrintVersion | undefined {
  const v = input as PrintVersion | undefined
  if (!v || typeof v.url !== 'string' || typeof v.rawUrl !== 'string') return undefined
  const ok = (u: string) => isOwnImageUrl(u) || u.startsWith('data:image/')
  if (!ok(v.url) || !ok(v.rawUrl)) return undefined
  return { ...v, copy: v.copy ? cleanCopy(v.copy) : undefined }
}

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Sign in to use the print studio.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.designId !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const design = await getDesign(userId, body.designId)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
  const mode = MODES.find((m) => m === body.mode) ?? 'create'
  const brand = await getBrand(userId, design.brandId)

  let mask: Buffer | undefined
  if (mode === 'area') {
    if (typeof body.mask !== 'string' || !body.mask.startsWith('data:image/png')) {
      return NextResponse.json({ error: 'Paint the area to change first.' }, { status: 400 })
    }
    mask = await fetchOwnImage(body.mask)
  }

  const issues = Array.isArray(body.issues)
    ? (body.issues as PreflightIssue[])
        .filter((i) => i && typeof i.message === 'string')
        .slice(0, 12)
        .map((i) => ({ ...i, message: i.message.slice(0, 300) }))
    : undefined

  try {
    const result = await render({
      userId,
      design,
      brand,
      pageIndex: Number(body.pageIndex) || 0,
      mode,
      prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 4000) : undefined,
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      quality: body.quality === 'draft' ? 'draft' : body.quality === 'print' ? 'print' : undefined,
      source: cleanSource(body.source),
      mask,
      copy: body.copy ? cleanCopy(body.copy) : undefined,
      issues,
    })
    await chargeRender(userId, design.id, result.cents)
    return NextResponse.json(result)
  } catch (err) {
    const status = err instanceof RenderError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Rendering failed'
    return NextResponse.json({ error: message }, { status })
  }
}
