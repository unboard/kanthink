import { NextResponse } from 'next/server'
import { loadRemoteImage } from '@/lib/print/server/crawl'
import { INGEST_KINDS, ingestImage, type IngestKind } from '@/lib/print/server/ingest'
import { printUser } from '@/lib/print/server/store'

/** POST { url, kind } → an image found on someone's website, stored as theirs. */

export const maxDuration = 60

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const kind = INGEST_KINDS.find((k) => k === body?.kind) as IngestKind | undefined
  if (typeof body?.url !== 'string' || !kind) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  try {
    const input = await loadRemoteImage(body.url)
    return NextResponse.json(await ingestImage(userId, input, kind))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Couldn’t bring that image in.' }, { status: 400 })
  }
}
