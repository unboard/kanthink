import { NextResponse } from 'next/server'
import { INGEST_KINDS, ingestImage, type IngestKind } from '@/lib/print/server/ingest'
import { printUser } from '@/lib/print/server/store'

/**
 * POST multipart { file, kind } → a stored image.
 *
 * Bodies are capped below Vercel's limit; the studio shrinks large photos before
 * sending. SVG is accepted (logos often are) and rasterized.
 */

export const maxDuration = 60

const MAX_BYTES = 4.2 * 1024 * 1024

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file') as File | null
  const kind = INGEST_KINDS.find((k) => k === form?.get('kind')) as IngestKind | undefined
  if (!file || !kind) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is too large — keep it under 4 MB.' }, { status: 413 })
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml|avif|heic|heif)$/i.test(file.type)) {
    return NextResponse.json({ error: 'Use a PNG, JPG, WebP or SVG image.' }, { status: 400 })
  }
  try {
    const result = await ingestImage(userId, Buffer.from(await file.arrayBuffer()), kind)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[print] upload failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
