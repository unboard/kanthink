import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { addArtworkOp } from '@/lib/print/orders/ops'

/**
 * POST /api/v1/print/jobs/:id/artwork
 *   JSON:      { artwork: [{ url, page?, filename?, origin? }] }
 *   multipart: file (+ page) — for files under 4 MB; send a URL for anything bigger.
 * Each file becomes the page's newest version, is checked, and appears on the page.
 */

export const maxDuration = 300

export const POST = route<{ id: string }>(async (req, who, { id }) => {
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: { message: 'Send the file as "file".', path: 'file' } }, { status: 422 })
    const url = `data:${file.type || 'application/octet-stream'};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
    const page = form.get('page')
    return NextResponse.json(await addArtworkOp(who, id, [{ url, filename: file.name, page: typeof page === 'string' ? page : undefined }]))
  }
  const b = await body(req)
  return NextResponse.json(await addArtworkOp(who, id, b.artwork))
})
