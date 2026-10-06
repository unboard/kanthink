import { NextResponse } from 'next/server'
import { issueApiKey, listApiKeys, revokeApiKey } from '@/lib/print/orders/server'
import { printUser } from '@/lib/print/server/store'

/**
 * GET    /api/print/keys            — the account's live keys (prefixes only)
 * POST   /api/print/keys { label }  — a new key, shown once
 * DELETE /api/print/keys?id=        — revoke
 * Signed-in only, so a leaked key can't mint more keys.
 */

export async function GET() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  return NextResponse.json({ keys: await listApiKeys(userId) })
}

export async function POST(req: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { label?: string }
  return NextResponse.json(await issueApiKey(userId, b.label))
}

export async function DELETE(req: Request) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (id) await revokeApiKey(userId, id)
  return NextResponse.json({ ok: true })
}
