import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appMessages, appUsers, playgroundApps, users } from '@/lib/db/schema'
import { createNotification } from '@/lib/notifications/createNotification'
import { sendAppReplyEmail } from '@/lib/emails/send'
import { signAccessToken } from '@/lib/playground/appAccess'
import type { AppThreadMessage } from '@/lib/types'

/**
 * One conversation between an app's maker and someone using it, whichever way a
 * message arrives: typed in the app, typed on the People tab, or sent as a reply
 * to one of the emails. Every path ends here, so a reply by email does exactly
 * what the same words typed in Kanthink would.
 *
 * The conversation lives in the app, and only there. The maker hears about a new
 * message through notifications (and push on their phone); the person using the
 * app gets an email that records the reply and opens the conversation, signed in,
 * with one click. Nobody replies by email.
 */

type AppRow = typeof playgroundApps.$inferSelect
type MemberRow = typeof appUsers.$inferSelect

function origin(): string {
  const url = process.env.NEXTAUTH_URL || ''
  return url.startsWith('https://') ? url.replace(/\/$/, '') : 'https://www.kanthink.com'
}

/**
 * The link that opens someone's conversation in the app, signed in. It carries a
 * verified-scope key, which is safe only because it goes to their own inbox.
 */
export function conversationUrl(member: Pick<MemberRow, 'id' | 'sessionEpoch'>, shareToken: string): string {
  const k = signAccessToken(member.id, member.sessionEpoch ?? 0, 'verified')
  return `${origin()}/api/play/${shareToken}/conversation?k=${encodeURIComponent(k)}`
}

/** The app's People tab, open on this conversation's app. */
export function threadUrl(app: Pick<AppRow, 'id' | 'channelId' | 'cardId'>): string {
  return `${origin()}/channel/${app.channelId}/card/${app.cardId}?app=${app.id}&pane=people`
}

async function ownerOf(member: MemberRow) {
  return db.query.users.findFirst({ where: eq(users.id, member.ownerId), columns: { id: true, email: true, name: true } })
}

function toMessage(row: { id: string; sender: 'user' | 'publisher'; body: string; createdAt: Date }): AppThreadMessage {
  return { id: row.id, sender: row.sender, body: row.body, isRead: false, createdAt: row.createdAt.toISOString() }
}

/** Someone using the app wrote to its maker. */
export async function postFromUser(opts: { app: AppRow; member: MemberRow; body: string }): Promise<AppThreadMessage> {
  const { app, member } = opts
  const body = opts.body.trim().slice(0, 4000)
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(appMessages).values({ id, appId: app.id, appUserId: member.id, sender: 'user', body, isRead: false, createdAt: now })
  await db.update(appUsers)
    .set({ unreadForOwner: member.unreadForOwner + 1, lastSeenAt: now, updatedAt: now })
    .where(eq(appUsers.id, member.id))

  const who = member.name || member.email
  await createNotification({
    userId: member.ownerId,
    type: 'app_feedback',
    title: `${who} on ${app.title}`,
    body: body.slice(0, 200),
    data: { appId: app.id, appUserId: member.id, cardId: app.cardId, channelId: app.channelId, kind: 'app_feedback' },
  })

  return toMessage({ id, sender: 'user', body, createdAt: now })
}

/** The app's maker answered someone using it. */
export async function postFromPublisher(opts: { app: AppRow; member: MemberRow; publisherUserId?: string | null; body: string }): Promise<AppThreadMessage> {
  const { app, member } = opts
  const body = opts.body.trim().slice(0, 4000)
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(appMessages).values({ id, appId: app.id, appUserId: member.id, sender: 'publisher', body, isRead: false, createdAt: now })
  await db.update(appUsers).set({ updatedAt: now }).where(eq(appUsers.id, member.id))

  const publisher = opts.publisherUserId
    ? await db.query.users.findFirst({ where: eq(users.id, opts.publisherUserId), columns: { name: true, email: true } })
    : await ownerOf(member)

  // A record of the reply, by email, with one button back into the conversation:
  // most people who leave feedback on a web app never return to the page on their
  // own, so the email is what brings them back. The answer happens in the app.
  if (app.shareToken) {
    void sendAppReplyEmail(member.email, {
      appTitle: app.title,
      publisherName: publisher?.name || '',
      message: body.slice(0, 2000),
      conversationUrl: conversationUrl(member, app.shareToken),
    }).catch(() => {})
  }

  if (member.userId) {
    await createNotification({
      userId: member.userId,
      type: 'app_reply',
      title: `Reply about ${app.title}`,
      body: body.slice(0, 200),
      data: { appId: app.id, shareToken: app.shareToken, kind: 'app_reply' },
    })
  }

  return toMessage({ id, sender: 'publisher', body, createdAt: now })
}
