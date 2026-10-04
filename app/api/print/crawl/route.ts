import { NextResponse } from 'next/server'
import { crawlSite } from '@/lib/print/server/crawl'
import { printUser } from '@/lib/print/server/store'

/** POST { url } → what a business's website says about its brand. */

export const maxDuration = 60

export async function POST(request: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.url !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  try {
    return NextResponse.json({ site: await crawlSite(body.url) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Couldn’t read that site.' }, { status: 400 })
  }
}
