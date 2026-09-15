import crypto from 'crypto'
import { db } from '@/lib/db'
import { appCustomerData, appUsers } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Storage that belongs to a customer rather than to a browser.
 *
 * A published app runs in an opaque-origin iframe: no cookies, no real
 * localStorage, no session. Until now that meant a generated app could only keep
 * things per-device, and the honest version of "your progress is saved" was "your
 * progress is cached in this browser until something clears it".
 *
 * This is the smallest thing that makes the sentence true. One table, addressed by
 * (app, customer, scope, key). The customer comes from a signed session the host
 * page resolved from a cookie — never from anything the app sends — so an app
 * cannot ask for a row belonging to somebody else by naming it.
 *
 * ## Why a separate token
 *
 * The iframe cannot read the access cookie, so the host bakes a short-lived token
 * into the document naming who is signed in. It carries the member's session epoch,
 * which means signing someone out (or a refund bumping their epoch) invalidates
 * every outstanding data token without rotating a secret.
 *
 * ## Why scope
 *
 * An owner previewing a draft is the same person with the same session, and a draft
 * that writes to the live rows would corrupt real customer data every time the owner
 * checked that saving works. Draft writes land in their own namespace.
 */

const SECRET =
  process.env.PLAYGROUND_TOKEN_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  'kanthink-playground-dev-secret'

/** Long enough for a session at the app; short enough that a leaked token dies. */
export const DATA_TOKEN_TTL_SECONDS = 60 * 60 * 12

export type DataScope = 'live' | 'draft'

export interface DataClaims {
  appId: string
  appUserId: string
  /** The member's session epoch when the token was minted. */
  epoch: number
  scope: DataScope
  /** Unix seconds. */
  expiresAt: number
}

function sign(parts: string[]): string {
  return crypto.createHmac('sha256', SECRET).update(parts.join('.')).digest('hex').slice(0, 32)
}

/**
 * Mint a token for a signed-in customer.
 *
 * Only the host page calls this, and only after it has resolved a real session
 * from the cookie. There is no path from an app's own request to a token.
 */
export function signDataToken(claims: Omit<DataClaims, 'expiresAt'> & { expiresAt?: number }): string {
  const expiresAt = claims.expiresAt ?? Math.floor(Date.now() / 1000) + DATA_TOKEN_TTL_SECONDS
  const parts = [claims.appId, claims.appUserId, String(claims.epoch), claims.scope, String(expiresAt)]
  return [...parts, sign(parts)].join('.')
}

export function verifyDataToken(token: string | null | undefined): DataClaims | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 6) return null

  const [appId, appUserId, epochRaw, scopeRaw, expiresRaw, mac] = parts
  const expected = sign([appId, appUserId, epochRaw, scopeRaw, expiresRaw])
  // Constant-time, so a wrong token cannot be narrowed down a character at a time.
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const epoch = Number(epochRaw)
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(epoch) || !Number.isFinite(expiresAt)) return null
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null
  if (scopeRaw !== 'live' && scopeRaw !== 'draft') return null

  return { appId, appUserId, epoch, scope: scopeRaw, expiresAt }
}

/**
 * The token said who; this checks the row still agrees.
 *
 * A token is a claim about the past. Signing out, a refund, or an owner revoking
 * access all bump the member's session epoch, and a token minted before that no
 * longer matches — which is how a sign-out on one device ends a session on another.
 */
export async function resolveDataMember(claims: DataClaims) {
  const member = await db.query.appUsers.findFirst({ where: eq(appUsers.id, claims.appUserId) })
  if (!member) return null
  if (member.appId !== claims.appId) return null
  if ((member.sessionEpoch ?? 0) !== claims.epoch) return null
  return member
}

// ── Limits ────────────────────────────────────────────────────────────────
//
// Chosen so an app can keep a real amount of work — a long game save, a year of
// entries — while one customer cannot fill the database. A write that would cross
// a limit is refused and says so. Nothing is ever evicted to make room: silently
// dropping the oldest save is the same as losing someone's work, only quieter.

/** Biggest single value, in bytes of JSON. */
export const MAX_VALUE_BYTES = 128 * 1024
/** Everything one customer holds in one app. */
export const MAX_CUSTOMER_BYTES = 1024 * 1024
/** Distinct keys one customer may use in one app. */
export const MAX_KEYS = 200
/** Keys are the app's own names, not free text from a person. */
export const MAX_KEY_LENGTH = 120

export type DataFailure =
  | { code: 'invalid_key'; message: string }
  | { code: 'value_too_large'; message: string; limit: number }
  | { code: 'quota_exceeded'; message: string; used: number; limit: number }
  | { code: 'too_many_keys'; message: string; limit: number }

export function validateKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    // Printable, no control characters, no newlines. Keys show up in error
    // messages and the owner's tooling.
    /^[\w.:@\-/ ]+$/.test(key)
  )
}

export interface DataRecord {
  key: string
  value: unknown
  bytes: number
  updatedAt: number | null
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    // A row that will not parse is a row nothing can use. Surfacing null beats
    // throwing and taking the whole app's load with it.
    return null
  }
}

/** Everything this customer has in this app, for the seed the page bakes in. */
export async function readAll(
  appId: string,
  appUserId: string,
  scope: DataScope,
): Promise<DataRecord[]> {
  const rows = await db
    .select()
    .from(appCustomerData)
    .where(
      and(
        eq(appCustomerData.appId, appId),
        eq(appCustomerData.appUserId, appUserId),
        eq(appCustomerData.scope, scope),
      ),
    )
  return rows.map((r) => ({
    key: r.key,
    value: parse(r.value),
    bytes: r.bytes,
    updatedAt: r.updatedAt ? Math.floor(r.updatedAt.getTime() / 1000) : null,
  }))
}

export async function readOne(
  appId: string,
  appUserId: string,
  scope: DataScope,
  key: string,
): Promise<DataRecord | null> {
  const row = await db.query.appCustomerData.findFirst({
    where: and(
      eq(appCustomerData.appId, appId),
      eq(appCustomerData.appUserId, appUserId),
      eq(appCustomerData.scope, scope),
      eq(appCustomerData.key, key),
    ),
  })
  if (!row) return null
  return {
    key: row.key,
    value: parse(row.value),
    bytes: row.bytes,
    updatedAt: row.updatedAt ? Math.floor(row.updatedAt.getTime() / 1000) : null,
  }
}

export interface UsageSummary {
  bytes: number
  keys: number
  limitBytes: number
  limitKeys: number
}

export async function usage(appId: string, appUserId: string, scope: DataScope): Promise<UsageSummary> {
  const [row] = await db
    .select({
      bytes: sql<number>`COALESCE(SUM(${appCustomerData.bytes}), 0)`,
      keys: sql<number>`COUNT(*)`,
    })
    .from(appCustomerData)
    .where(
      and(
        eq(appCustomerData.appId, appId),
        eq(appCustomerData.appUserId, appUserId),
        eq(appCustomerData.scope, scope),
      ),
    )
  return {
    bytes: Number(row?.bytes ?? 0),
    keys: Number(row?.keys ?? 0),
    limitBytes: MAX_CUSTOMER_BYTES,
    limitKeys: MAX_KEYS,
  }
}

export type WriteResult =
  | { ok: true; record: DataRecord; usage: UsageSummary }
  | { ok: false; failure: DataFailure; usage: UsageSummary }

/**
 * Save one value for one customer.
 *
 * Refuses rather than evicts. An app that is over its limit gets an error it can
 * show, and every byte the customer already had is still there — which is the
 * difference between "we could not save that" and "we lost your last month".
 */
export async function write(
  appId: string,
  appUserId: string,
  scope: DataScope,
  key: string,
  value: unknown,
): Promise<WriteResult> {
  const current = await usage(appId, appUserId, scope)

  if (!validateKey(key)) {
    return {
      ok: false,
      usage: current,
      failure: {
        code: 'invalid_key',
        message: `Keys must be 1-${MAX_KEY_LENGTH} characters of letters, digits, and . : @ - _ /`,
      },
    }
  }

  const serialised = JSON.stringify(value ?? null)
  const bytes = Buffer.byteLength(serialised, 'utf8')
  if (bytes > MAX_VALUE_BYTES) {
    return {
      ok: false,
      usage: current,
      failure: {
        code: 'value_too_large',
        message: `That value is ${Math.ceil(bytes / 1024)} KB; the most one key can hold is ${MAX_VALUE_BYTES / 1024} KB.`,
        limit: MAX_VALUE_BYTES,
      },
    }
  }

  const existing = await db.query.appCustomerData.findFirst({
    where: and(
      eq(appCustomerData.appId, appId),
      eq(appCustomerData.appUserId, appUserId),
      eq(appCustomerData.scope, scope),
      eq(appCustomerData.key, key),
    ),
  })

  if (!existing && current.keys >= MAX_KEYS) {
    return {
      ok: false,
      usage: current,
      failure: {
        code: 'too_many_keys',
        message: `This app has already used all ${MAX_KEYS} of your saved keys. Remove one before adding another.`,
        limit: MAX_KEYS,
      },
    }
  }

  // The new total, counting a replacement as a swap rather than an addition.
  const projected = current.bytes - (existing?.bytes ?? 0) + bytes
  if (projected > MAX_CUSTOMER_BYTES) {
    return {
      ok: false,
      usage: current,
      failure: {
        code: 'quota_exceeded',
        message: `That would take your saved data to ${Math.ceil(projected / 1024)} KB, over the ${MAX_CUSTOMER_BYTES / 1024} KB this app can keep for you. Nothing was changed.`,
        used: current.bytes,
        limit: MAX_CUSTOMER_BYTES,
      },
    }
  }

  const now = new Date()
  if (existing) {
    await db
      .update(appCustomerData)
      .set({ value: serialised, bytes, updatedAt: now })
      .where(eq(appCustomerData.id, existing.id))
  } else {
    await db.insert(appCustomerData).values({
      appId,
      appUserId,
      scope,
      key,
      value: serialised,
      bytes,
      createdAt: now,
      updatedAt: now,
    })
  }

  return {
    ok: true,
    record: { key, value, bytes, updatedAt: Math.floor(now.getTime() / 1000) },
    usage: {
      ...current,
      bytes: projected,
      keys: existing ? current.keys : current.keys + 1,
    },
  }
}

export async function remove(
  appId: string,
  appUserId: string,
  scope: DataScope,
  key: string,
): Promise<UsageSummary> {
  await db
    .delete(appCustomerData)
    .where(
      and(
        eq(appCustomerData.appId, appId),
        eq(appCustomerData.appUserId, appUserId),
        eq(appCustomerData.scope, scope),
        eq(appCustomerData.key, key),
      ),
    )
  return usage(appId, appUserId, scope)
}
