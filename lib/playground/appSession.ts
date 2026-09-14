import { db } from '@/lib/db'
import { appUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  accessCookieName,
  sessionMatchesMember,
  verifyAccessToken,
  type AccessScope,
  type AccessSession,
} from './appAccess'

/**
 * Who this request is, on this app.
 *
 * One resolver, used by every public route, because the ways a session can be
 * wrong — a token for a different app, a token whose epoch has been bumped, a token
 * from before sessions carried proof — should be handled in one place rather than
 * re-derived at each door.
 */
export interface ResolvedSession {
  member: typeof appUsers.$inferSelect
  session: AccessSession
}

export async function resolveAppSession(
  rawCookie: string | undefined,
  appId: string,
): Promise<ResolvedSession | null> {
  const session = verifyAccessToken(rawCookie)
  if (!session) return null

  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, session.appUserId) })
  if (!sessionMatchesMember(session, member, appId)) return null

  return { member: member!, session }
}

/** The cookie for a freshly proved session. */
export function accessCookie(appId: string, token: string) {
  return {
    name: accessCookieName(appId),
    value: token,
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

export type { AccessScope }
