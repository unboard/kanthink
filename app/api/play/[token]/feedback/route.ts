import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { appMessages, appUsers } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { accessCookieName, canReadPrivateData } from '@/lib/playground/appAccess'
import { resolveAppSession } from '@/lib/playground/appSession'
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
 * Reading a thread needs a proved address; writing to one does not.
 *
 * That asymmetry is deliberate. The thread is private — it used to open to anyone
 * who typed the right email, which handed over a stranger's support conversation.
 * But putting a code in front of "this button is broken" would end feedback
 * entirely, and the reply reaches them by email regardless. So anyone may write,
 * only the proved may read back.
 *
 * GET  — this visitor's thread, if they have proved the address.
 * POST — send a message. An unproved address may still write; it just cannot read.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    await ensureSchema()
    const app = await findPublishedApp(token)
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const resolved = await sessionFor(req, app.id)
    if (!resolved) return NextResponse.json({ messages: [], identified: false })

    // A purchase-scope session bought the app; it did not prove the inbox, so the
    // conversation attached to that address stays shut to it. A cookie predating
    // scopes does not parse and never reaches here at all.
    if (!canReadPrivateData(resolved.session)) {
      return NextResponse.json({
        messages: [],
        identified: false,
        needsVerification: true,
        email: resolved.member.email,
      })
    }

    const member = resolved.member

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
    const resolvedPost = await sessionFor(req, app.id)
    let member = resolvedPost?.member ?? null
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

    // No cookie is ever minted here. Writing is open to anyone, so issuing a
    // session on a write would hand an account to whoever typed the address — which
    // is the hole this route used to have in its own right.
    const verified = canReadPrivateData(resolvedPost?.session)
    return NextResponse.json({
      message,
      identified: verified,
      needsVerification: !verified,
      email: member.email,
    })
  } catch (error) {
    console.error('[play/feedback] POST failed:', error)
    return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 500 })
  }
}

/** The visitor behind the access cookie, checked against this app. */
async function sessionFor(req: NextRequest, appId: string) {
  return resolveAppSession(req.cookies.get(accessCookieName(appId))?.value, appId)
}
