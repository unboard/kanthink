import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { ensureAppUser, findAppOwnerId, findPublishedApp } from '@/lib/playground/publicApp'

export const runtime = 'nodejs'

/**
 * Reserve an app from its test page.
 *
 * Saves the address as one of the app's people, with the moment they reserved, and
 * nothing else. No charge, no account, no code sent. It grants nothing — there's
 * nothing to grant yet — so it needs no proof of the address, only a sane one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; website?: string }

  // A field people can't see. Bots fill it in.
  if (body.website) return NextResponse.json({ ok: true })

  const email = (body.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'That doesn’t look like an email address.' }, { status: 400 })
  }

  await ensureSchema()
  const app = await findPublishedApp(token)
  if (!app || !app.reserveMode) return NextResponse.json({ error: 'This page isn’t taking reservations.' }, { status: 404 })

  const ownerId = await findAppOwnerId(app)
  const member = await ensureAppUser({ appId: app.id, ownerId, email, name: body.name?.slice(0, 80) })
  if (!member.reservedAt) {
    await db.update(appUsers).set({ reservedAt: new Date(), updatedAt: new Date() }).where(eq(appUsers.id, member.id))
  }
  return NextResponse.json({ ok: true })
}
