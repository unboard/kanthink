import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appMessages, appUsers, playgroundApps, users } from '@/lib/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { requirePermission, PermissionError } from '@/lib/api/permissions'
import type { AppAudienceMember, AppThreadMessage, AppUserStatus } from '@/lib/types'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ appId: string }>
}

/**
 * Who is using this app, and what they have said about it.
 *
 * GET                 — the audience list, with per-person message counts.
 * GET ?memberId=…     — one person's thread, and marks their messages read.
 *
 * "Paid or not" is the column the publisher actually looks at, so the list is
 * ordered by it before recency: someone who bought the thing outranks someone who
 * opened it, however long ago they did either.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  const memberId = req.nextUrl.searchParams.get('memberId')

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'view')

    if (memberId) {
      const member = await db.query.appUsers.findFirst({
        where: and(eq(appUsers.id, memberId), eq(appUsers.appId, appId)),
      })
      if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const thread = await db.query.appMessages.findMany({
        where: eq(appMessages.appUserId, memberId),
        orderBy: [asc(appMessages.createdAt)],
      })

      // Opening the thread is reading it. Only the incoming side clears — the
      // publisher's own replies stay unread until the app user sees them.
      if (member.unreadForOwner > 0) {
        await db.update(appMessages)
          .set({ isRead: true })
          .where(and(eq(appMessages.appUserId, memberId), eq(appMessages.sender, 'user')))
        await db.update(appUsers)
          .set({ unreadForOwner: 0, updatedAt: new Date() })
          .where(eq(appUsers.id, memberId))
      }

      const messages: AppThreadMessage[] = thread.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        isRead: !!m.isRead,
        createdAt: (m.createdAt ?? new Date()).toISOString(),
      }))

      return NextResponse.json({ member: toMember(member, messages.length, messages.at(-1)?.createdAt), messages })
    }

    const members = await db.query.appUsers.findMany({
      where: eq(appUsers.appId, appId),
      orderBy: [desc(appUsers.lastSeenAt)],
    })

    const allMessages = await db.query.appMessages.findMany({
      where: eq(appMessages.appId, appId),
      columns: { appUserId: true, createdAt: true },
      orderBy: [asc(appMessages.createdAt)],
    })

    const counts = new Map<string, { count: number; last: string | undefined }>()
    for (const m of allMessages) {
      const entry = counts.get(m.appUserId) ?? { count: 0, last: undefined }
      entry.count += 1
      entry.last = (m.createdAt ?? new Date()).toISOString()
      counts.set(m.appUserId, entry)
    }

    const rank: Record<AppUserStatus, number> = { paid: 0, free: 1, canceled: 2, refunded: 3 }
    const audience = members
      .map((m) => {
        const c = counts.get(m.id)
        return toMember(m, c?.count ?? 0, c?.last)
      })
      .sort((a, b) => {
        const byStatus = rank[a.status] - rank[b.status]
        if (byStatus !== 0) return byStatus
        return (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt)
      })

    return NextResponse.json({ audience })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/audience] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load the audience' }, { status: 500 })
  }
}

function toMember(
  row: typeof appUsers.$inferSelect,
  messageCount: number,
  lastMessageAt?: string,
): AppAudienceMember {
  return {
    id: row.id,
    appId: row.appId,
    email: row.email,
    name: row.name,
    userId: row.userId,
    status: row.status,
    amountPaid: row.amountPaid,
    currency: row.currency,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    accessExpiresAt: row.accessExpiresAt ? row.accessExpiresAt.toISOString() : null,
    sessionCount: row.sessionCount,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    unreadForOwner: row.unreadForOwner,
    messageCount,
    lastMessageAt: lastMessageAt ?? null,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  }
}

/**
 * The publisher's side of the conversation.
 *
 * `action: 'reply'`   — answer one person. They see it in the app's feedback panel
 *                       next time they open it, and if their email belongs to a
 *                       Kanthink account they get a notification too.
 * `action: 'to_brief'` — take what they said and put it on the app's own build
 *                       thread, which is where the generator reads its brief from.
 *                       This is the "turn a complaint into a fix" button: it does
 *                       not build anything, it just makes the next build aware.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { appId } = await params
  let body: { memberId?: string; action?: 'reply' | 'to_brief'; body?: string; messageId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
  }

  try {
    await ensureSchema()
    const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    await requirePermission(app.channelId, session.user.id, 'edit')

    const member = await db.query.appUsers.findFirst({
      where: and(eq(appUsers.id, body.memberId), eq(appUsers.appId, appId)),
    })
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.action === 'to_brief') {
      const source = body.messageId
        ? await db.query.appMessages.findFirst({ where: eq(appMessages.id, body.messageId) })
        : (await db.query.appMessages.findMany({
            where: and(eq(appMessages.appUserId, member.id), eq(appMessages.sender, 'user')),
            orderBy: [desc(appMessages.createdAt)],
            limit: 1,
          }))[0]

      if (!source) return NextResponse.json({ error: 'Nothing to add' }, { status: 400 })

      const who = member.name?.trim() || member.email
      const note = {
        id: crypto.randomUUID(),
        type: 'question' as const,
        // Attributed, because the generator reads the thread as a brief and needs
        // to know this is a report from a user rather than the owner's own words.
        content: `Feedback from ${who} (${member.status === 'paid' ? 'paid' : 'free'}):\n\n${source.body}`,
        createdAt: new Date().toISOString(),
      }
      const messages = [...((app.messages || []) as unknown[]), note]
      await db.update(playgroundApps)
        .set({ messages: messages as typeof playgroundApps.$inferInsert.messages, updatedAt: new Date() })
        .where(eq(playgroundApps.id, appId))

      // Hand back the whole app row, not just a success flag.
      //
      // The drawer loaded this app's thread when it opened and has been holding it
      // ever since, so a note written here is invisible over on the Thread tab until
      // something reloads — which read as "the button did nothing" right up until
      // the next build, when the note turned out to have been there all along.
      const updated = await db.query.playgroundApps.findFirst({
        where: eq(playgroundApps.id, appId),
      })
      return NextResponse.json({ success: true, addedToBrief: true, app: updated, note })
    }

    const text = (body.body || '').trim()
    if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })

    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(appMessages).values({
      id,
      appId,
      appUserId: member.id,
      sender: 'publisher',
      body: text.slice(0, 4000),
      isRead: false,
      createdAt: now,
    })
    await db.update(appUsers).set({ updatedAt: now }).where(eq(appUsers.id, member.id))

    // Email regardless of whether they have a Kanthink account: most people who
    // leave feedback on a web app never return to the page, so a reply that only
    // lives inside the app is a reply nobody reads. The thread is still the record.
    if (app.shareToken) {
      const { sendAppReplyEmail } = await import('@/lib/emails/send')
      const publisher = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { name: true },
      })
      void sendAppReplyEmail(member.email, {
        appTitle: app.title,
        publisherName: publisher?.name || '',
        message: text.slice(0, 1000),
        appUrl: `${process.env.NEXTAUTH_URL || 'https://kanthink.com'}/play/${app.shareToken}`,
      }).catch(() => {})
    }

    // A Kanthink account also gets it in the normal notification path.
    if (member.userId) {
      const { createNotification } = await import('@/lib/notifications/createNotification')
      await createNotification({
        userId: member.userId,
        type: 'app_reply',
        title: `Reply about ${app.title}`,
        body: text.slice(0, 200),
        data: { appId, shareToken: app.shareToken, kind: 'app_reply' },
      })
    }

    const message: AppThreadMessage = {
      id,
      sender: 'publisher',
      body: text,
      isRead: false,
      createdAt: now.toISOString(),
    }
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[playground/apps/:id/audience] POST failed:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
