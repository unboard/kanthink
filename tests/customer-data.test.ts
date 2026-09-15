import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Per-customer storage: who a request is allowed to reach, and what happens when
 * it asks for more room than it has.
 *
 * The token half is pure and tested directly. The database half is tested against
 * an in-memory stand-in, because what matters here is the decision — refuse, or
 * write — not SQLite.
 */

process.env.PLAYGROUND_TOKEN_SECRET = 'test-secret-for-customer-data'

// A tiny stand-in for the two tables these functions touch.
const rows: Array<Record<string, unknown>> = []
const members = new Map<string, Record<string, unknown>>()

vi.mock('@/lib/db', () => {
  const match = (r: Record<string, unknown>, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => r[k] === v)

  return {
    db: {
      query: {
        appUsers: { findFirst: async ({ where }: never) => members.get((where as never as { id: string }).id) ?? undefined },
        appCustomerData: {
          findFirst: async ({ where }: never) => rows.find((r) => match(r, where as never)) ?? undefined,
        },
      },
      select: (shape?: Record<string, unknown>) => ({
        from: () => ({
          where: async (w: Record<string, unknown>) => {
            const hits = rows.filter((r) => match(r, w))
            if (shape && 'bytes' in shape) {
              return [{ bytes: hits.reduce((n, r) => n + (r.bytes as number), 0), keys: hits.length }]
            }
            return hits
          },
        }),
      }),
      insert: () => ({ values: async (v: Record<string, unknown>) => { rows.push({ ...v }) } }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: async (w: Record<string, unknown>) => {
            for (const r of rows) if (match(r, w)) Object.assign(r, patch)
          },
        }),
      }),
      delete: () => ({
        where: async (w: Record<string, unknown>) => {
          for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], w)) rows.splice(i, 1)
        },
      }),
    },
  }
})

// The query builders are identity functions here: a where clause is just the
// object of fields it constrains, which is all the stand-in above needs.
vi.mock('drizzle-orm', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  and: (...parts: Record<string, unknown>[]) => Object.assign({}, ...parts),
  eq: (col: { name?: string } | string, value: unknown) => ({
    [typeof col === 'string' ? col : (col.name ?? String(col))]: value,
  }),
  sql: Object.assign((strings: TemplateStringsArray) => String(strings.raw[0]), { raw: String }),
}))

vi.mock('@/lib/db/schema', () => ({
  appUsers: { id: { name: 'id' } },
  appCustomerData: {
    id: { name: 'id' },
    appId: { name: 'appId' },
    appUserId: { name: 'appUserId' },
    scope: { name: 'scope' },
    key: { name: 'key' },
    value: { name: 'value' },
    bytes: { name: 'bytes' },
  },
}))

const data = await import('../lib/playground/customerData')

const APP = 'app-1'
const ALICE = 'member-alice'
const BOB = 'member-bob'

beforeEach(() => {
  rows.length = 0
  members.clear()
  members.set(ALICE, { id: ALICE, appId: APP, sessionEpoch: 0, email: 'alice@example.com' })
  members.set(BOB, { id: BOB, appId: APP, sessionEpoch: 0, email: 'bob@example.com' })
})

describe('a data token says who, and only the server decides', () => {
  it('round-trips the claims it was given', () => {
    const token = data.signDataToken({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'live' })
    const claims = data.verifyDataToken(token)
    expect(claims).toMatchObject({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'live' })
  })

  it('refuses a token whose customer was edited', () => {
    const token = data.signDataToken({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'live' })
    const forged = token.replace(ALICE, BOB)
    expect(data.verifyDataToken(forged)).toBeNull()
  })

  it('refuses a token whose scope was edited', () => {
    // Otherwise an owner's draft token becomes a live one by editing a word.
    const token = data.signDataToken({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'draft' })
    expect(data.verifyDataToken(token.replace('.draft.', '.live.'))).toBeNull()
  })

  it('refuses an expired token', () => {
    const token = data.signDataToken({
      appId: APP, appUserId: ALICE, epoch: 0, scope: 'live',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    })
    expect(data.verifyDataToken(token)).toBeNull()
  })

  it('refuses nothing at all', () => {
    expect(data.verifyDataToken(null)).toBeNull()
    expect(data.verifyDataToken('')).toBeNull()
    expect(data.verifyDataToken('garbage')).toBeNull()
  })
})

describe('a token stops working when the session does', () => {
  it('accepts a token whose epoch still matches the row', async () => {
    const claims = data.verifyDataToken(
      data.signDataToken({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'live' }),
    )!
    expect(await data.resolveDataMember(claims)).toMatchObject({ id: ALICE })
  })

  it('refuses one minted before the customer signed out', async () => {
    const claims = data.verifyDataToken(
      data.signDataToken({ appId: APP, appUserId: ALICE, epoch: 0, scope: 'live' }),
    )!
    // Signing out, or a refund, bumps the epoch. Every outstanding token dies.
    members.get(ALICE)!.sessionEpoch = 1
    expect(await data.resolveDataMember(claims)).toBeNull()
  })

  it('refuses a customer of a different app', async () => {
    const claims = data.verifyDataToken(
      data.signDataToken({ appId: 'another-app', appUserId: ALICE, epoch: 0, scope: 'live' }),
    )!
    expect(await data.resolveDataMember(claims)).toBeNull()
  })
})

describe('two customers never see each other', () => {
  it('keeps writes apart', async () => {
    await data.write(APP, ALICE, 'live', 'progress', { level: 9 })
    await data.write(APP, BOB, 'live', 'progress', { level: 1 })

    expect((await data.readOne(APP, ALICE, 'live', 'progress'))?.value).toEqual({ level: 9 })
    expect((await data.readOne(APP, BOB, 'live', 'progress'))?.value).toEqual({ level: 1 })
  })

  it('does not leak one customer into the other listing', async () => {
    await data.write(APP, ALICE, 'live', 'diary', 'private')
    expect(await data.readAll(APP, BOB, 'live')).toEqual([])
  })

  it('deleting one customer key leaves the other standing', async () => {
    await data.write(APP, ALICE, 'live', 'progress', { level: 9 })
    await data.write(APP, BOB, 'live', 'progress', { level: 1 })
    await data.remove(APP, ALICE, 'live', 'progress')

    expect(await data.readOne(APP, ALICE, 'live', 'progress')).toBeNull()
    expect((await data.readOne(APP, BOB, 'live', 'progress'))?.value).toEqual({ level: 1 })
  })
})

describe('a draft preview is a separate place to write', () => {
  it('does not show live data to a draft, or the other way round', async () => {
    await data.write(APP, ALICE, 'live', 'progress', { level: 9 })
    await data.write(APP, ALICE, 'draft', 'progress', { level: 999 })

    expect((await data.readOne(APP, ALICE, 'live', 'progress'))?.value).toEqual({ level: 9 })
    expect((await data.readOne(APP, ALICE, 'draft', 'progress'))?.value).toEqual({ level: 999 })
  })
})

describe('limits refuse rather than evict', () => {
  it('refuses a value bigger than one key can hold', async () => {
    const huge = 'x'.repeat(data.MAX_VALUE_BYTES + 10)
    const result = await data.write(APP, ALICE, 'live', 'big', huge)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe('value_too_large')
  })

  it('leaves what was already saved untouched when it refuses', async () => {
    await data.write(APP, ALICE, 'live', 'keep', { precious: true })
    await data.write(APP, ALICE, 'live', 'big', 'x'.repeat(data.MAX_VALUE_BYTES + 10))

    // The point of refusing: the earlier work is still there afterwards.
    expect((await data.readOne(APP, ALICE, 'live', 'keep'))?.value).toEqual({ precious: true })
  })

  it('refuses a write that would take the customer over their total', async () => {
    // Eight chunks of 128 KB is 1 MB; the ninth crosses the line.
    const chunk = 'y'.repeat(data.MAX_VALUE_BYTES - 16)
    for (let i = 0; i < 8; i++) await data.write(APP, ALICE, 'live', `chunk-${i}`, chunk)

    const result = await data.write(APP, ALICE, 'live', 'chunk-8', chunk)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('quota_exceeded')
      expect(result.failure.message).toMatch(/Nothing was changed/)
    }
    // Nothing was dropped to make room.
    expect((await data.readAll(APP, ALICE, 'live')).length).toBe(8)
  })

  it('lets a replacement through even when the customer is nearly full', async () => {
    const chunk = 'y'.repeat(data.MAX_VALUE_BYTES - 16)
    for (let i = 0; i < 8; i++) await data.write(APP, ALICE, 'live', `chunk-${i}`, chunk)

    // Overwriting is a swap, not an addition — otherwise a full customer could
    // never save again, including saving a smaller version of what they have.
    const result = await data.write(APP, ALICE, 'live', 'chunk-0', 'tiny')
    expect(result.ok).toBe(true)
  })

  it('refuses a key that is not a key', async () => {
    for (const bad of ['', 'x'.repeat(200), 'has\nnewline', 'curly{brace}']) {
      const result = await data.write(APP, ALICE, 'live', bad, 1)
      expect(result.ok, bad).toBe(false)
    }
  })

  it('reports usage against the limits', async () => {
    await data.write(APP, ALICE, 'live', 'a', 'hello')
    const used = await data.usage(APP, ALICE, 'live')
    expect(used.keys).toBe(1)
    expect(used.bytes).toBeGreaterThan(0)
    expect(used.limitBytes).toBe(data.MAX_CUSTOMER_BYTES)
    expect(used.limitKeys).toBe(data.MAX_KEYS)
  })
})

describe('saved work survives the app changing', () => {
  it('is addressed without any reference to a release', async () => {
    await data.write(APP, ALICE, 'live', 'progress', { level: 9 })
    // Publishing a new version changes playground_apps and adds a row to
    // playground_app_versions. Nothing here is keyed by either, so there is no
    // path by which a release could move or orphan this row.
    const [row] = rows
    expect(Object.keys(row)).not.toContain('versionId')
    expect(Object.keys(row)).not.toContain('releaseId')
    expect((await data.readOne(APP, ALICE, 'live', 'progress'))?.value).toEqual({ level: 9 })
  })
})
