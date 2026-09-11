import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appMessages, appUsers } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { accessCookieName, verifyAccessToken } from '@/lib/playground/appAccess'
import { createNotification } from '@/lib/notifications/createNotification'
import {
  ensureAppUser,
  findAppOwnerId,
  findPublishedApp,
} from '@/lib/playground/publicApp'
import type { AppThreadMessage } from '@/lib/types'

export const runtime = 'nodejs'

/**
 * The line from a published app back to whoever made it.
 *
 * Someone using an app can say "this is wrong" without leaving the page, and the
 * publisher answers from the app's Audience tab. It is one thread per person per
 * app — a support inbox scoped so tightly it needs no triage.
 *
 * GET  — this visitor's thread, and marks the publisher's replies read.
 * POST — send a message. An email identifies the sender when they have no cookie yet.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const member = await memberFromCookie(req, app.id)
    if (!member) return NextResponse.json({ messages: [], identified: false })

    const rows = await db.query.appMessages.findMany({
      where: eq(appMessages.appUserId, member.id),
      orderBy: [asc(appMessages.createdAt)],
    })

    // Reading the panel is reading the replies in it.
    await db.update(appMessages)
      .set({ isRead: true })
      .where(and(eq(appMessages.appUserId, member.id), eq(appMessages.sender, 'publisher')))

    const messages: AppThreadMessage[] = rows.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      isRead: !!m.isRead,
      createdAt: (m.createdAt ?? new Date()).toISOString(),
    }))

    return NextResponse.json({ messages, identified: true, email: member.email })
  } catch (error) {
    console.error('[play/feedback] GET failed:', error)
    return NextResponse.json({ error: 'Could not load your messages' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let body: { body?: string; email?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const text = (body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (text.length > 4000) {
    return NextResponse.json({ error: 'That is too long — keep it under 4000 characters.' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // A free app has no reason to have asked for an email yet, so feedback is also
    // the moment someone first identifies themselves.
    let member = await memberFromCookie(req, app.id)
    if (!member) {
      const email = (body.email || '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json(
          { error: 'Leave an email so they can reply.', needsEmail: true },
          { status: 400 },
        )
      }
      const ownerId = await findAppOwnerId(app)
      member = await ensureAppUser({ appId: app.id, ownerId, email, name: body.name })
    }

    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(appMessages).values({
      id,
      appId: app.id,
      appUserId: member.id,
      sender: 'user',
      body: text,
      isRead: false,
      createdAt: now,
    })
    await db.update(appUsers)
      .set({ unreadForOwner: member.unreadForOwner + 1, lastSeenAt: now, updatedAt: now })
      .where(eq(appUsers.id, member.id))

    await createNotification({
      userId: member.ownerId,
      type: 'app_feedback',
      title: `${member.name || member.email} on ${app.title}`,
      body: text.slice(0, 200),
      data: { appId: app.id, appUserId: member.id, kind: 'app_feedback' },
    })

    const message: AppThreadMessage = {
      id,
      sender: 'user',
      body: text,
      isRead: false,
      createdAt: now.toISOString(),
    }

    // Hand back the cookie when this was also the identifying step.
    const res = NextResponse.json({ message, identified: true, email: member.email })
    if (!req.cookies.get(accessCookieName(app.id))) {
      const { signAccessToken } = await import('@/lib/playground/appAccess')
      res.cookies.set(accessCookieName(app.id), signAccessToken(member.id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
    }
    return res
  } catch (error) {
    console.error('[play/feedback] POST failed:', error)
    return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 500 })
  }
}

/** The visitor behind the access cookie, checked against this app. */
async function memberFromCookie(req: NextRequest, appId: string) {
  const memberId = verifyAccessToken(req.cookies.get(accessCookieName(appId))?.value)
  if (!memberId) return null
  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
  // A token signed for a different app must not resolve here, however valid it is.
  return member && member.appId === appId ? member : null
}
