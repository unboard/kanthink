import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sessions } from '@/lib/db/schema'

/**
 * GET /api/auth/agent?t=SESSION_TOKEN
 *
 * Production-safe agent login: looks up an existing Auth.js database session
 * and Set-Cookie's the same cookie Auth.js would, so `auth()` accepts it.
 * Agent seats only (kan-bugs-agent, or users.kind = 'agent' if that column exists).
 * Does not accept INTERNAL_API_SECRET. Does not mint sessions for arbitrary users.
 *
 * Cookie matches @auth/core defaultCookies(useSecureCookies):
 *   name:     __Secure-authjs.session-token  (https) / authjs.session-token (http)
 *   value:    raw sessions.session_token (database strategy — not a JWT)
 *   httpOnly: true
 *   secure:   true on https
 *   sameSite: lax
 *   path:     /
 *   expires:  sessions.expires
 *
 * Browser URL: https://www.kanthink.com/api/auth/agent?t=SESSION_TOKEN
 */

const AGENT_USER_ID = 'kan-bugs-agent'
const REDIRECT_PATH = '/channel/B3sKLmb4J0ttTI_asXbji'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function sessionExpiresAt(expires: Date | number | string): Date | null {
  if (expires instanceof Date) {
    const t = expires.getTime()
    return Number.isNaN(t) ? null : expires
  }
  const n = Number(expires)
  if (!Number.isFinite(n) || n <= 0) return null
  // Drizzle sqlite timestamp mode stores unix seconds; ms timestamps are >= 1e12.
  return new Date(n < 1e12 ? n * 1000 : n)
}

async function isAgentSeat(userId: string): Promise<boolean> {
  if (userId === AGENT_USER_ID) return true
  try {
    const rows = await db.all(sql`SELECT kind FROM users WHERE id = ${userId} LIMIT 1`)
    const row = rows[0] as { kind?: unknown } | undefined
    return row?.kind === 'agent'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/no such column/i.test(message)) return false
    throw err
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t')
  if (!token) return unauthorized()

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.sessionToken, token),
  })
  if (!session) return unauthorized()

  const expiresAt = sessionExpiresAt(session.expires)
  if (!expiresAt || expiresAt.getTime() <= Date.now()) return unauthorized()

  if (!(await isAgentSeat(session.userId))) return unauthorized()

  // Match Auth.js init: useSecureCookies = url.protocol === "https:"
  const useSecureCookies = url.protocol === 'https:'
  const cookieName = `${useSecureCookies ? '__Secure-' : ''}authjs.session-token`

  const response = NextResponse.redirect(new URL(REDIRECT_PATH, url.origin), 302)
  // Database strategy: cookie value is the sessionToken used in getSessionAndUser().
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return response
}
