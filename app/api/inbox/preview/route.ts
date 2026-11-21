import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchUrlMetadata } from '@/lib/url-metadata'

/**
 * GET /api/inbox/preview?url=… — what the share sheet shows of the thing being shared
 * (title, description, image, site), read the same way the saved card will be.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const url = new URL(req.url).searchParams.get('url') || ''
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({})
  const meta = await fetchUrlMetadata(url)
  return NextResponse.json(meta, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
