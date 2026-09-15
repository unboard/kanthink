/**
 * The two checks left over from the pricing run: several callers contending for one
 * slot, and two apps contending for one owner allowance.
 *
 * Run twice over. Once through reserve() itself, and once through the exported
 * admissionStatement on genuinely independent connections — because a single shared
 * client serialises its own writers, so a one-client test can pass for a reason that
 * has nothing to do with the guard.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

const FILE = 'file:' + process.argv[2]
// One multi-connection race per process. A local SQLite file will not hand the write
// lock back to a second set of contenders inside the same process, whatever is closed
// or rolled back first, so each race is run as its own invocation.
const SECTION = process.argv[3] ?? 'shared'
process.env.DATABASE_URL = FILE
delete process.env.TURSO_AUTH_TOKEN

let failures = 0
const ok = (label: string, pass: boolean, detail = '') => {
  if (!pass) failures++
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

const OWNER = 'owner-c'
const APP_A = 'app-c-a'
const APP_B = 'app-c-b'
// A second owner with his own pair of apps, so the independent-connection races need
// no shared-connection cleanup after them — a contender that loses the race can hold
// the file lock for longer than a local SQLite reader is willing to wait.
const OWNER2 = 'owner-d'
const APP_C = 'app-d-c'
const APP_D = 'app-d-d'
// And a third, for the wider burst, for the same reason.
const OWNER3 = 'owner-e'
const APP_E = 'app-e-e'

async function main() {
  const m = await import('../../lib/db/migrations.mjs')
  const { db, client } = await import('../../lib/db')
  const { sql } = await import('drizzle-orm')

  const run = (text: string, args: unknown[] = []) => client.execute({ sql: text, args } as never)

  // Setup writes wait for the contenders to let go of the file rather than erroring.
  await run(`PRAGMA busy_timeout = 20000`)
  // WAL, because that is the concurrency model the real database has. Under a
  // rollback journal a bare INSERT...SELECT already holds the writer's lock for the
  // whole statement, so the guard looks safe for a reason production does not share:
  // in WAL a reader takes a snapshot first, and every contender can sum a ledger
  // none of the others has written to yet.
  await run(`PRAGMA journal_mode = WAL`)

  await run(`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY NOT NULL, email text NOT NULL)`)
  await run(`CREATE TABLE IF NOT EXISTS channels (id text PRIMARY KEY NOT NULL, owner_id text, name text)`)
  await run(`CREATE TABLE IF NOT EXISTS cards (id text PRIMARY KEY NOT NULL)`)
  for (const stmt of m.ALL_STATEMENTS) { try { await run(stmt) } catch { /* stubbed tables */ } }

  await run(`INSERT INTO users (id, email) VALUES (?, 'c@e.com')`, [OWNER])
  await run(`INSERT INTO channels (id, owner_id, name) VALUES ('ch-c', ?, 'C')`, [OWNER])
  await run(`INSERT INTO cards (id) VALUES ('card-c')`)
  await run(`INSERT INTO users (id, email) VALUES (?, 'd@e.com')`, [OWNER2])
  await run(`INSERT INTO users (id, email) VALUES (?, 'e@e.com')`, [OWNER3])
  await run(`INSERT INTO channels (id, owner_id, name) VALUES ('ch-e', ?, 'E')`, [OWNER3])
  await run(`INSERT INTO channels (id, owner_id, name) VALUES ('ch-d', ?, 'D')`, [OWNER2])
  for (const id of [APP_A, APP_B, APP_C, APP_D, APP_E]) {
    await run(
      `INSERT INTO playground_apps (id, channel_id, card_id, title, code, is_public, share_token,
       ai_spend_limit_cents, ai_customer_limit_cents)
       VALUES (?, ?, 'card-c', 'App', 'CODE', 1, ?, 100000, 100000)`,
      [id, id.startsWith('app-d') ? 'ch-d' : id.startsWith('app-e') ? 'ch-e' : 'ch-c', 'tok-' + id],
    )
  }

  const { maximumCostMillicents, MILLICENTS_PER_CENT, formatMillicents } = await import('../../lib/playground/aiPricing')
  const budget = await import('../../lib/playground/aiBudget')

  // Ceilings are set in whole cents, so the call has to be sized to fit one of them
  // and not two. Solved for rather than assumed: a 1c ceiling holds four calls of a
  // quarter of a cent, and a test that expects one would be reading its own
  // arithmetic error as a concurrency failure.
  const MODEL = 'gemini-2.5-flash'
  let tokens = 1000
  let one = 0
  while (tokens < 400_000) {
    one = maximumCostMillicents({ modelId: MODEL, kind: 'text', promptChars: 1000, maxOutputTokens: tokens })!
    if (one > MILLICENTS_PER_CENT / 2 && one <= MILLICENTS_PER_CENT) break
    tokens = Math.round(tokens * 1.2)
  }
  const cap = 1
  const call = (appId: string) => ({
    appId, ownerId: OWNER, kind: 'text' as const, modelId: MODEL,
    promptChars: 1000, maxOutputTokens: tokens,
  })
  // Owner D's ceiling is set before any race runs, so nothing needs to write through
  // the shared connection while the independent contenders hold the file.
  await run(`UPDATE users SET app_ai_spend_limit_cents = ? WHERE id = ?`, [cap, OWNER2])
  await run(`UPDATE users SET app_ai_spend_limit_cents = 100000 WHERE id = ?`, [OWNER3])
  await run(`UPDATE playground_apps SET ai_spend_limit_cents = ? WHERE id = ?`, [cap, APP_E])

  const clear = () => run(`DELETE FROM app_ai_usage WHERE owner_id = ?`, [OWNER])
  const rowsFor = async (where: string, args: unknown[]) =>
    Number((await client.execute({ sql: `SELECT COUNT(*) AS n FROM app_ai_usage WHERE ${where}`, args } as never)).rows[0].n)

  console.log(`\nOne call costs ${formatMillicents(one)} of the ${cap}¢ allowance each ceiling is set to.`)

  // ── Through reserve(), eight at once, room for one ───────────────────
  if (SECTION === 'shared') {
  console.log('\nEight simultaneous reservations, room for one')
  await clear()
  await run(`UPDATE users SET app_ai_spend_limit_cents = 100000 WHERE id = ?`, [OWNER])
  await run(`UPDATE playground_apps SET ai_spend_limit_cents = ? WHERE id = ?`, [cap, APP_A])

  const burst = await Promise.all(Array.from({ length: 8 }, () => budget.reserve(call(APP_A))))
  const admitted = burst.filter((b) => b.ok).length
  ok('exactly one admitted', admitted === 1, `${admitted} of 8`)
  ok('exactly one ledger row', (await rowsFor('app_id = ?', [APP_A])) === 1)
  const refused = burst.find((b) => !b.ok)
  ok('the rest were refused by the app ceiling',
     !!refused && !refused.ok && refused.denial.scope === 'app',
     refused && !refused.ok ? refused.denial.scope : '')

  // ── Through reserve(), two apps, one owner allowance ─────────────────
  console.log('\nTwo apps competing for the same owner allowance')
  await clear()
  await run(`UPDATE playground_apps SET ai_spend_limit_cents = 100000`)
  await run(`UPDATE users SET app_ai_spend_limit_cents = ? WHERE id = ?`, [cap, OWNER])

  const both = await Promise.all([budget.reserve(call(APP_A)), budget.reserve(call(APP_B))])
  const winners = both.filter((b) => b.ok).length
  ok('the owner ceiling binds across apps', winners === 1, `${winners} of 2 admitted`)
  const loser = both.find((b) => !b.ok)
  ok('the refusal names the owner ceiling',
     !!loser && !loser.ok && loser.denial.scope === 'owner',
     loser && !loser.ok ? loser.denial.scope : '')

  console.log('\nSix reservations across two apps, one owner slot')
  await clear()
  const mixed = await Promise.all([APP_A, APP_B, APP_A, APP_B, APP_A, APP_B].map((a) => budget.reserve(call(a))))
  ok('still exactly one', mixed.filter((b) => b.ok).length === 1, `${mixed.filter((b) => b.ok).length} of 6`)
  }

  // ── Independent connections ──────────────────────────────────────────
  // Each contender gets its own client, so nothing upstream of SQLite is
  // serialising them. Same statement reserve() emits, same transaction.
  const contender = (n: number) => {
    const c = createClient({ url: FILE })
    return { raw: c, db: drizzle(c), n }
  }
  const raceAs = async (appId: string, ownerId: string, conns: ReturnType<typeof contender>[]) => {
    const limits = await budget.resolveLimits(appId, ownerId)
    if (process.env.DEBUG_RACE) console.log('    limits', appId, JSON.stringify(limits), 'cost', one)
    const period = budget.currentPeriodKey()
    const now = Math.floor(Date.now() / 1000)
    return Promise.all(conns.map(async (c) => {
      await c.raw.execute('PRAGMA busy_timeout = 15000')
      const stmt = budget.admissionStatement({ ...call(appId), ownerId }, one, limits, period, `race-${appId}-${c.n}`, now)
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          // NEGATIVE CONTROL: with RACE_NO_TXN the same statement runs bare, on
          // SQLite's implicit per-statement transaction. That takes a read snapshot
          // before it takes the write lock, so every contender sums the ledger as it
          // was before any of them inserted. If this still admits one, the test is
          // not measuring what it claims to.
          const r = process.env.RACE_NO_TXN
            ? await c.db.run(stmt)
            : await c.db.transaction(async (tx) => tx.run(stmt))
          return Number(r.rowsAffected ?? 0) > 0
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // A BEGIN IMMEDIATE that lost the file can leave the connection believing a
          // transaction is still open, and it then holds the lock for good. Clear it
          // before waiting, or the retry is guaranteed to fail the same way.
          await c.raw.execute('ROLLBACK').catch(() => {})
          if (!/SQLITE_BUSY|database is locked|write conflict/i.test(msg)) throw e
          if (process.env.DEBUG_RACE) console.log('    busy retry', c.n, attempt)
          await new Promise((r) => setTimeout(r, 25 * (attempt + 1) + Math.random() * 40))
        }
      }
      return false
    }))
  }

  // The two-app race goes first. A six-writer race over a local SQLite file leaves
  // its losers holding the file well after they have returned, which would starve
  // anything that ran after it — a property of the harness, not of the guard.
  if (SECTION === 'across') {
  console.log('\nTwo independent connections, two apps, one owner allowance')
  const [ca, cb] = [contender(90), contender(91)]
  const across = await Promise.all([raceAs(APP_C, OWNER2, [ca]), raceAs(APP_D, OWNER2, [cb])])
  const acrossGot = across.flat().filter(Boolean).length
  ok('the owner ceiling binds across apps and connections', acrossGot === 1, `${acrossGot} of 2 admitted`)
  ok('one ledger row for the owner, not two', (await rowsFor('owner_id = ?', [OWNER2])) === 1)
  for (const c of [ca, cb]) c.raw.close()
  }

  if (SECTION === 'burst') {
  console.log('\nSix independent connections, room for one')
  const conns = Array.from({ length: 6 }, (_, i) => contender(i))
  const indep = await raceAs(APP_E, OWNER3, conns)
  const got = indep.filter(Boolean).length
  ok('exactly one admitted across separate connections', got === 1, `${got} of 6`)
  ok('exactly one ledger row', (await rowsFor('app_id = ?', [APP_E])) === 1)

  for (const c of conns) c.raw.close()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => { console.error(e); process.exit(1) })
