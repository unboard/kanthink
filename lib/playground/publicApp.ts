import { db } from '@/lib/db'
import { appUsers, playgroundApps, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

/**
 * Shared server-side helpers for the public side of a published app.
 *
 * The paywall, the feedback panel and the grant route all need the same three
 * things — the app behind a share token, the origin the request arrived on, and the
 * person holding a given access token — and getting any of them subtly different
 * between routes is how a buyer ends up locked out of what they just paid for.
 */

/** The published app for a share token, or null. Never returns a private app. */
export async function findPublishedApp(token: string) {
  if (!token) return null
  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  })
  return app ?? null
}

/**
 * The deployment origin, from the request headers.
 *
 * NEXTAUTH_URL is not used here: preview deployments and the production domain are
 * the same build, and sending a buyer back to the wrong host after checkout is a
 * failure that only shows up in the place it is most expensive.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}

export interface EnsureMemberInput {
  appId: string
  ownerId: string
  email: string
  name?: string | null
}

/**
 * The `app_users` row for this person on this app, created if it is their first visit.
 *
 * Everyone who identifies themselves gets a row, buyer or not. A list of people who
 * looked and did not buy is more useful to a publisher than a list of buyers alone,
 * and it is also what the feedback thread hangs off.
 */
export async function ensureAppUser(input: EnsureMemberInput) {
  const email = input.email.trim().toLowerCase()
  const existing = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.appId, input.appId), eq(appUsers.email, email)),
  })

  const now = new Date()
  if (existing) {
    await db.update(appUsers).set({
      // A name arriving later fills a blank; it never overwrites one they gave.
      name: existing.name || input.name?.trim() || null,
      sessionCount: existing.sessionCount + 1,
      lastSeenAt: now,
      updatedAt: now,
    }).where(eq(appUsers.id, existing.id))
    return (await db.query.appUsers.findFirst({ where: eq(appUsers.id, existing.id) }))!
  }

  // Link to a Kanthink account when the email is one. That link is what lets the
  // publisher's replies arrive as a notification rather than only inside the app.
  const account = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, name: true },
  })

  const id = crypto.randomUUID()
  await db.insert(appUsers).values({
    id,
    appId: input.appId,
    ownerId: input.ownerId,
    email,
    name: input.name?.trim() || account?.name || null,
    userId: account?.id ?? null,
    status: 'free',
    sessionCount: 1,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  })

  return (await db.query.appUsers.findFirst({ where: eq(appUsers.id, id) }))!
}

/**
 * Who publishes this app.
 *
 * The channel's owner, not whoever happened to press New app: on a shared channel
 * an editor can build something, but the commercial relationship with its users
 * belongs to one person, and channels already have exactly one of those.
 */
export async function findAppOwnerId(app: { createdBy?: string | null; channelId: string }): Promise<string> {
  const { channels } = await import('@/lib/db/schema')
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, app.channelId),
    columns: { ownerId: true },
  })
  return channel?.ownerId ?? app.createdBy ?? ''
}
