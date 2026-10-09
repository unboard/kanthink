import { NextResponse } from 'next/server'
import { printUser } from '@/lib/print/server/store'
import { readTemplate, TemplateError, type TemplateFile } from '@/lib/print/server/template'

/**
 * POST multipart { file (one or two), notes } → a draft product read off a printer's
 * template. Nothing is saved: the person checks the draft, then saves it as a preset.
 */

export const maxDuration = 90

const MAX_BYTES = 4.2 * 1024 * 1024

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const uploads = form.getAll('file').filter((f): f is File => f instanceof File).slice(0, 2)
  const total = uploads.reduce((n, f) => n + f.size, 0)
  if (total > MAX_BYTES) return NextResponse.json({ error: 'Those files are too large together — keep them under 4 MB.' }, { status: 413 })
  if (uploads.some((f) => !/^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(f.type))) {
    return NextResponse.json({ error: 'Use a PDF, PNG, JPG or WebP.' }, { status: 400 })
  }
  const files: TemplateFile[] = await Promise.all(
    uploads.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), type: f.type, name: f.name.slice(0, 80) })),
  )
  const notes = typeof form.get('notes') === 'string' ? (form.get('notes') as string) : ''
  try {
    return NextResponse.json(await readTemplate(userId, files, notes))
  } catch (err) {
    if (err instanceof TemplateError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[print] template read failed:', err)
    return NextResponse.json({ error: 'Couldn’t read that template.' }, { status: 500 })
  }
}
