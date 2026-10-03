import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appMessages, appUsers, playgroundApps, users } from '@/lib/db/schema'
import { createNotification } from '@/lib/notifications/createNotification'
import { sendAppMessageEmail, sendAppReplyEmail } from '@/lib/emails/send'
import { inboundConfigured, replyAddress } from '@/lib/email/replyRouting'
import type { AppThreadMessage } from '@/lib/types'

/**
 * One conversation between an app's maker and someone using it, whichever way a
 * message arrives: typed in the app, typed on the People tab, or sent as a reply
 * to one of the emails. Every path ends here, so a reply by email does exactly
 * what the same words typed in Kanthink would.
 *
 * Every email carries a Reply-To that brings the answer back into this thread
 * (see lib/email/replyRouting), so either person can keep the conversation going
 * from their inbox.
 */

type AppRow = typeof playgroundApps.$inferSelect
type MemberRow = typeof appUsers.$inferSelect

function origin(): string {
  const url = process.env.NEXTAUTH_URL || ''
  return url.startsWith('https://') ? url.replace(/\/$/, '') : 'https://www.kanthink.com'
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
export async function postFromUser(opts: { app: AppRow; member: MemberRow; body: string; via?: 'app' | 'email' }): Promise<AppThreadMessage> {
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

  // The maker hears by email too, and can answer by replying to it.
  const owner = await ownerOf(member)
  if (owner?.email) {
    void sendAppMessageEmail(owner.email, {
      fromName: who,
      appTitle: app.title,
      message: body.slice(0, 2000),
      threadUrl: threadUrl(app),
      replyLands: inboundConfigured(),
    }, replyAddress({ appUserId: member.id, as: 'publisher' }, member.email)).catch(() => {})
  }

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

  // Email regardless of whether they have a Kanthink account: most people who leave
  // feedback on a web app never return to the page, so a reply that only lives in
  // the app is a reply nobody reads. Replying to the email continues the thread.
  if (app.shareToken) {
    void sendAppReplyEmail(member.email, {
      appTitle: app.title,
      publisherName: publisher?.name || '',
      message: body.slice(0, 2000),
      appUrl: `${origin()}/play/${app.shareToken}`,
      replyLands: inboundConfigured(),
    }, replyAddress({ appUserId: member.id, as: 'user' }, publisher?.email)).catch(() => {})
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
