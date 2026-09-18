import crypto from 'crypto'
import { db } from '@/lib/db'
import { appUsers, playgroundApps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  gatesAction,
  hasActiveAccess,
  type AccessScope,
  type AccessSession,
  type PaywallState,
} from './appAccess'
import { purchasesForMember, toRef } from './appPurchases'

/**
 * Proof of entitlement that survives the trip into a sandboxed iframe.
 *
 * An action-gated app is delivered to everybody, paid or not, so the flag the app
 * reads — `kanthinkPay.entitled` — is a boolean in a browser the visitor controls.
 * Flipping it in devtools is trivial and always will be. That is acceptable for the
 * app's own UI and unacceptable for anything that spends the publisher's money.
 *
 * So the host page mints this alongside the flag, and every server capability an
 * action-gated app can reach asks for it. The iframe cannot forge one: it is an
 * HMAC over claims the page derived from a real session cookie, and there is no
 * request an app can make that produces one.
 *
 * Deliberately separate from the data token. That one says "this is who you are";
 * this one says "this person has paid". A visitor with no purchase still has saved
 * work of their own to reach, so conflating the two would lock people out of their
 * own storage the moment a publisher started charging.
 */
const SECRET =
  process.env.PLAYGROUND_TOKEN_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  'kanthink-playground-dev-secret'

/** Matches the data token's life. A leaked one dies within a session, not a year. */
export const PAY_TOKEN_TTL_SECONDS = 60 * 60 * 12

export interface PayClaims {
  appId: string
  appUserId: string
  /** The member's session epoch when it was minted. */
  epoch: number
  /** Carried through so entitlement is re-decided the same way the page decided it. */
  scope: AccessScope
  /** The purchase a purchase-scope session was granted on, or null. */
  purchaseId: string | null
  /** Unix seconds. */
  expiresAt: number
}

const NO_REF = '-'

function sign(parts: string[]): string {
  return crypto.createHmac('sha256', `${SECRET}:app-pay`).update(parts.join('.')).digest('hex').slice(0, 32)
}

/**
 * Mint a token for an entitled visitor.
 *
 * Only ever called by the host page, and only after it has resolved a session from
 * the cookie and found a live purchase behind it.
 */
export function signPayToken(claims: Omit<PayClaims, 'expiresAt'> & { expiresAt?: number }): string {
  const expiresAt = claims.expiresAt ?? Math.floor(Date.now() / 1000) + PAY_TOKEN_TTL_SECONDS
  const parts = [
    claims.appId,
    claims.appUserId,
    String(claims.epoch),
    claims.scope,
    claims.purchaseId ?? NO_REF,
    String(expiresAt),
  ]
  return [...parts, sign(parts)].join('.')
}

export function verifyPayToken(token: string | null | undefined): PayClaims | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 7) return null

  const [appId, appUserId, epochRaw, scopeRaw, ref, expiresRaw, mac] = parts
  if (scopeRaw !== 'verified' && scopeRaw !== 'purchase') return null

  const expected = sign([appId, appUserId, epochRaw, scopeRaw, ref, expiresRaw])
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  // Constant-time, so a wrong token cannot be narrowed a character at a time.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const epoch = Number(epochRaw)
  const expiresAt = Number(expiresRaw)
  if (!Number.isInteger(epoch) || !Number.isFinite(expiresAt)) return null
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null

  return {
    appId,
    appUserId,
    epoch,
    scope: scopeRaw,
    purchaseId: ref === NO_REF ? null : ref,
    expiresAt,
  }
}

/**
 * May this request use a paid server capability on this app?
 *
 * Answers for every app, not only the gated ones, because the question a route
 * wants to ask is "am I allowed to do this", and three of the four answers are yes
 * for reasons that have nothing to do with the token:
 *
 * - the app is free, or its paywall is off — nothing to enforce
 * - the app gates at the door — an unpaid visitor never got the code in the first
 *   place, so anything reaching here already came from behind the paywall
 * - the app gates an action — this is the only case the token decides
 *
 * The token is a claim about the past and the rows are the present, so a refund or
 * a cancelled subscription takes effect on the next call rather than whenever the
 * token happens to lapse.
 */
export async function allowsPaidCapability(
  appId: string,
  token: string | null | undefined,
): Promise<boolean> {
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) })
  if (!app) return false
  return appAllowsPaidCapability(app, token)
}

/** The same decision, when the caller has already loaded the app row. */
export async function appAllowsPaidCapability(
  app: PaywallState,
  token: string | null | undefined,
): Promise<boolean> {
  if (!gatesAction(app)) return true

  const claims = verifyPayToken(token)
  if (!claims) return false

  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, claims.appUserId) })
  if (!member) return false
  if (member.appId !== claims.appId) return false
  if ((member.sessionEpoch ?? 0) !== claims.epoch) return false

  const session: AccessSession = {
    appUserId: claims.appUserId,
    scope: claims.scope,
    epoch: claims.epoch,
    purchaseId: claims.purchaseId,
  }
  const purchases = (await purchasesForMember(member.id)).map(toRef)
  return hasActiveAccess(app, session, purchases)
}
