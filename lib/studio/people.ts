import { createHmac, timingSafeEqual } from 'crypto'
import { render } from '@react-email/render'
import React from 'react'
import { db } from '@/lib/db'
import { appEmails, appMessages, appUsers, personNotes, playgroundApps } from '@/lib/db/schema'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { sendTrackedEmail } from '@/lib/customerio'
import { PersonEmail } from '@/lib/emails/PersonEmail'
import { formatAppPrice } from '@/lib/playground/appAccess'
import { personStage, stageEvents, type PersonStage } from './stage'
import { nextFollowUp } from './followUps'
import { baseUrl, playUrl, publisherName } from './pipeline'

/**
 * People: everyone who reserved, used or bought one of your apps, and every email
 * between you and them.
 *
 * Ownership is the app_users.owner_id column — the publisher of the app, which is the
 * channel owner — and every read and write here checks it. Nothing here is reachable
 * by the customer: their side of the conversation is app_messages, served by the app.
 */

export type MemberRow = typeof appUsers.$inferSelect
export type EmailRow = typeof appEmails.$inferSelect
type AppRow = typeof playgroundApps.$inferSelect

export function appIsLive(app: Pick<AppRow, 'publishedVersionId' | 'isPublic' | 'reserveMode'>) {
  return Boolean(app.publishedVersionId && app.isPublic && !app.reserveMode)
}

export function appPriceLabel(app: AppRow) {
  if (app.paywallEnabled && app.priceAmount) return formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)
  return app.reservePage?.priceLabel || null
}

/**
 * Your own row on your own app. Trying an app you made gives you a row like anyone
 * else's, which is how saving gets tested — but you aren't one of your people.
 */
export function isOwnRow(m: Pick<MemberRow, 'userId' | 'email'>, ownerId: string, ownerEmail?: string | null) {
  return m.userId === ownerId || (!!ownerEmail && m.email.toLowerCase() === ownerEmail.toLowerCase())
}

// ── Unsubscribe links ──

const secret = () => process.env.NEXTAUTH_SECRET || process.env.INTERNAL_API_SECRET || 'kanthink-dev'
export const unsubscribeSig = (appUserId: string) => createHmac('sha256', secret()).update(`unsub:${appUserId}`).digest('hex').slice(0, 32)
export const unsubscribeUrl = (appUserId: string) => `${baseUrl()}/api/people/unsubscribe?u=${encodeURIComponent(appUserId)}&t=${unsubscribeSig(appUserId)}`
export function checkUnsubscribeSig(appUserId: string, sig: string) {
  const a = Buffer.from(unsubscribeSig(appUserId))
  const b = Buffer.from(sig || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Reads ──

export interface PersonSummary {
  id: string
  name: string | null
  email: string
  appId: string
  appTitle: string
  stage: PersonStage
  unsubscribed: boolean
  draftWaiting: boolean
  lastEmail: { subject: string; status: string; openedAt: string | null; clickedAt: string | null; sentAt: string | null } | null
  unread: number
  lastActivity: string
}

const iso = (d?: Date | null) => (d ? d.toISOString() : null)

export async function listPeople(ownerId: string): Promise<PersonSummary[]> {
  const me = await publisherName(ownerId)
  const members = (await db.query.appUsers.findMany({
    where: eq(appUsers.ownerId, ownerId),
    orderBy: [desc(appUsers.updatedAt)],
    limit: 500,
  })).filter((m) => !isOwnRow(m, ownerId, me.email))
  if (!members.length) return []
  const appIds = [...new Set(members.map((m) => m.appId))]
  const apps = await db.query.playgroundApps.findMany({
    where: inArray(playgroundApps.id, appIds),
    columns: { id: true, title: true },
  })
  const title = new Map(apps.map((a) => [a.id, a.title]))
  const emails = await db.query.appEmails.findMany({
    where: eq(appEmails.ownerId, ownerId),
    orderBy: [asc(appEmails.createdAt)],
  })
  const byMember = new Map<string, EmailRow[]>()
  for (const e of emails) byMember.set(e.appUserId, [...(byMember.get(e.appUserId) ?? []), e])

  return members.map((m) => {
    const mine = byMember.get(m.id) ?? []
    const sent = mine.filter((e) => e.status === 'sent')
    const last = sent.at(-1)
    const activity = [m.updatedAt, m.lastSeenAt, ...mine.map((e) => e.updatedAt)].filter(Boolean) as Date[]
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      appId: m.appId,
      appTitle: title.get(m.appId) || 'App',
      stage: personStage(m),
      unsubscribed: !!m.unsubscribedAt,
      draftWaiting: mine.some((e) => e.status === 'draft'),
      lastEmail: last ? { subject: last.subject, status: last.status, openedAt: iso(last.openedAt), clickedAt: iso(last.clickedAt), sentAt: iso(last.sentAt) } : null,
      unread: m.unreadForOwner,
      lastActivity: new Date(Math.max(...activity.map((d) => d.getTime()), 0)).toISOString(),
    }
  }).sort((a, b) => Number(b.draftWaiting) - Number(a.draftWaiting) || b.lastActivity.localeCompare(a.lastActivity))
}

export type ThreadItem =
  | { kind: 'event'; at: string; text: string }
  | { kind: 'theirs'; at: string; text: string }
  | { kind: 'reply'; at: string; text: string }
  | { kind: 'email'; at: string; email: PublicEmail }

export interface PublicEmail {
  id: string
  subject: string
  body: string
  status: EmailRow['status']
  source: EmailRow['source']
  reason: string | null
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
  createdAt: string
}

const toPublicEmail = (e: EmailRow): PublicEmail => ({
  id: e.id, subject: e.subject, body: e.body, status: e.status, source: e.source, reason: e.reason,
  sentAt: iso(e.sentAt), deliveredAt: iso(e.deliveredAt), openedAt: iso(e.openedAt), clickedAt: iso(e.clickedAt), bouncedAt: iso(e.bouncedAt),
  createdAt: (e.createdAt ?? new Date()).toISOString(),
})

export async function loadMember(ownerId: string, appUserId: string) {
  const member = await db.query.appUsers.findFirst({ where: and(eq(appUsers.id, appUserId), eq(appUsers.ownerId, ownerId)) })
  if (!member) return null
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, member.appId) })
  return app ? { member, app } : null
}

export async function personDetail(ownerId: string, appUserId: string) {
  const found = await loadMember(ownerId, appUserId)
  if (!found) return null
  const { member, app } = found
  const [messages, emails, notes] = await Promise.all([
    db.query.appMessages.findMany({ where: eq(appMessages.appUserId, member.id), orderBy: [asc(appMessages.createdAt)] }),
    db.query.appEmails.findMany({ where: eq(appEmails.appUserId, member.id), orderBy: [asc(appEmails.createdAt)] }),
    db.query.personNotes.findMany({ where: and(eq(personNotes.appUserId, member.id), eq(personNotes.ownerId, ownerId)), orderBy: [asc(personNotes.createdAt)] }),
  ])

  const thread: ThreadItem[] = [
    ...stageEvents(member, app.title).map((e) => ({ kind: 'event' as const, at: e.at.toISOString(), text: e.text })),
    ...messages.map((m) => ({
      kind: m.sender === 'user' ? 'theirs' as const : 'reply' as const,
      at: (m.createdAt ?? new Date()).toISOString(),
      text: m.body,
    })),
    // The customer's side shows only what actually went to them.
    ...emails.filter((e) => e.status === 'sent' || e.status === 'failed').map((e) => ({
      kind: 'email' as const, at: (e.sentAt ?? e.createdAt ?? new Date()).toISOString(), email: toPublicEmail(e),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  const draftsById = new Map(emails.map((e) => [e.id, toPublicEmail(e)]))
  const linked = new Set(notes.map((n) => n.emailId).filter(Boolean))
  // Crew drafts arrive without a note of their own; give each one, so it shows on
  // the private side with its reason.
  const crewDrafts = emails.filter((e) => e.source === 'crew' && !linked.has(e.id)).map((e) => ({
    id: `crew-${e.id}`, role: 'kan' as const, at: (e.createdAt ?? new Date()).toISOString(),
    content: e.reason ? `The follow-up crew drafted this. ${e.reason}` : 'The follow-up crew drafted this.',
    email: draftsById.get(e.id) ?? null,
  }))
  const side = [
    ...notes.map((n) => ({ id: n.id, role: n.role, at: (n.createdAt ?? new Date()).toISOString(), content: n.content, email: n.emailId ? draftsById.get(n.emailId) ?? null : null })),
    ...crewDrafts,
  ].sort((a, b) => a.at.localeCompare(b.at))

  return {
    person: {
      id: member.id,
      name: member.name,
      email: member.email,
      stage: personStage(member),
      unsubscribed: !!member.unsubscribedAt,
      appId: app.id,
      appTitle: app.title,
      appUrl: app.shareToken ? playUrl(app.shareToken) : null,
      live: appIsLive(app),
      priceLabel: appPriceLabel(app),
    },
    thread,
    side,
  }
}

// ── Writes ──

export async function createDraft(opts: {
  ownerId: string
  member: MemberRow
  subject: string
  body: string
  source: EmailRow['source']
  kind?: string
  reason?: string
}) {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(appEmails).values({
    id,
    appId: opts.member.appId,
    appUserId: opts.member.id,
    ownerId: opts.ownerId,
    subject: opts.subject.trim().slice(0, 200) || '(no subject)',
    body: opts.body.trim().slice(0, 8000),
    status: 'draft',
    source: opts.source,
    kind: opts.kind ?? 'manual',
    reason: opts.reason ?? null,
    createdAt: now,
    updatedAt: now,
  })
  return (await db.query.appEmails.findFirst({ where: eq(appEmails.id, id) }))!
}

/**
 * Send one email. The only path anything takes to a customer's inbox from People,
 * so the checks live here: it must be yours, still a draft, and they must not have
 * asked you to stop.
 */
export async function sendEmail(ownerId: string, emailId: string, edits?: { subject?: string; body?: string }) {
  const email = await db.query.appEmails.findFirst({ where: and(eq(appEmails.id, emailId), eq(appEmails.ownerId, ownerId)) })
  if (!email) throw new Error('Email not found')
  if (email.status !== 'draft') throw new Error(email.status === 'sent' ? 'That email already went.' : 'That draft was dropped.')
  const found = await loadMember(ownerId, email.appUserId)
  if (!found) throw new Error('Person not found')
  const { member, app } = found
  if (member.unsubscribedAt) throw new Error(`${member.name || member.email} asked not to be emailed about ${app.title}.`)

  const subject = (edits?.subject ?? email.subject).trim() || email.subject
  const body = (edits?.body ?? email.body).trim() || email.body
  const me = await publisherName(ownerId)
  const appUrl = app.shareToken ? playUrl(app.shareToken) : baseUrl()
  const html = await render(React.createElement(PersonEmail, {
    appTitle: app.title,
    publisherName: me.name.split(/\s+/)[0] || '',
    body,
    appUrl,
    unsubscribeUrl: unsubscribeUrl(member.id),
  }))
  const result = await sendTrackedEmail({ to: member.email, subject, html, replyTo: me.email || null })
  const now = new Date()
  await db.update(appEmails).set({
    subject,
    body,
    status: result.ok ? 'sent' : 'failed',
    cioDeliveryId: result.deliveryId,
    sentAt: result.ok ? now : null,
    updatedAt: now,
  }).where(eq(appEmails.id, email.id))
  if (!result.ok) throw new Error(result.error || 'The email didn’t send.')
  return (await db.query.appEmails.findFirst({ where: eq(appEmails.id, email.id) }))!
}

export async function dropEmail(ownerId: string, emailId: string) {
  const email = await db.query.appEmails.findFirst({ where: and(eq(appEmails.id, emailId), eq(appEmails.ownerId, ownerId)) })
  if (!email || email.status !== 'draft') return false
  await db.update(appEmails).set({ status: 'dropped', updatedAt: new Date() }).where(eq(appEmails.id, email.id))
  return true
}

/** Write your own email to someone and send it straight away. */
export async function sendDirect(ownerId: string, appUserId: string, subject: string, body: string) {
  const found = await loadMember(ownerId, appUserId)
  if (!found) throw new Error('Person not found')
  if (found.member.unsubscribedAt) throw new Error(`${found.member.name || found.member.email} asked not to be emailed about ${found.app.title}.`)
  const draft = await createDraft({ ownerId, member: found.member, subject, body, source: 'you' })
  return sendEmail(ownerId, draft.id)
}

// ── The follow-up crew ──

/**
 * One pass of the follow-up crew over everyone who uses your apps. Drafts what
 * the rules say, or sends it when you've told it to stop asking. Returns what it did.
 */
export async function runFollowUps(ownerId: string, opts: { mode: 'ask' | 'auto'; appId?: string; now?: Date }) {
  const now = opts.now ?? new Date()
  const members = await db.query.appUsers.findMany({
    where: opts.appId ? and(eq(appUsers.ownerId, ownerId), eq(appUsers.appId, opts.appId)) : eq(appUsers.ownerId, ownerId),
    limit: 1000,
  })
  if (!members.length) return { drafted: 0, sent: 0 }
  const appIds = [...new Set(members.map((m) => m.appId))]
  const apps = new Map((await db.query.playgroundApps.findMany({ where: inArray(playgroundApps.id, appIds) })).map((a) => [a.id, a]))
  const emails = await db.query.appEmails.findMany({ where: eq(appEmails.ownerId, ownerId) })
  const me = await publisherName(ownerId)

  let drafted = 0
  let sent = 0
  for (const member of members) {
    // Your own row on your own app is how you test it, not a customer.
    if (isOwnRow(member, ownerId, me.email)) continue
    const app = apps.get(member.appId)
    if (!app || !app.shareToken) continue
    const mine = emails.filter((e) => e.appUserId === member.id).map((e) => ({ ...e, kind: e.kind || 'manual' }))
    const next = nextFollowUp({
      member,
      app: { title: app.title, live: appIsLive(app), url: playUrl(app.shareToken), priceLabel: appPriceLabel(app) },
      emails: mine,
      publisherName: me.name,
      now,
    })
    if (!next) continue
    const draft = await createDraft({ ownerId, member, subject: next.subject, body: next.body, source: 'crew', kind: next.kind, reason: next.reason })
    drafted += 1
    if (opts.mode === 'auto') {
      try { await sendEmail(ownerId, draft.id); sent += 1 } catch (e) { console.error('[studio] auto follow-up failed:', e) }
    }
  }
  return { drafted, sent }
}
