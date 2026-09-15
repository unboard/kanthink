/**
 * Negative control for the concurrency checks.
 *
 * A passing test proves nothing until you have seen it fail. This runs the obvious
 * wrong way to enforce a ceiling — read the total, decide, then insert — over the
 * same independent connections the real check uses. Each contender decides against
 * a ledger none of the others has written to yet, so they all admit themselves.
 *
 * If this over-admits and the real guard does not, the difference is the guard.
 */
import { createClient } from '@libsql/client'

const FILE = 'file:' + process.argv[2]
process.env.DATABASE_URL = FILE
delete process.env.TURSO_AUTH_TOKEN

const OWNER = 'owner-x'
const APP = 'app-x'

async function main() {
  const m = await import('../../lib/db/migrations.mjs')
  const { client } = await import('../../lib/db')
  const run = (sql: string, args: unknown[] = []) => client.execute({ sql, args } as never)

  await run(`PRAGMA busy_timeout = 20000`)
  await run(`PRAGMA journal_mode = WAL`)
  await run(`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY NOT NULL, email text NOT NULL)`)
  await run(`CREATE TABLE IF NOT EXISTS channels (id text PRIMARY KEY NOT NULL, owner_id text, name text)`)
  await run(`CREATE TABLE IF NOT EXISTS cards (id text PRIMARY KEY NOT NULL)`)
  for (const stmt of m.ALL_STATEMENTS) { try { await run(stmt) } catch { /* stubbed tables */ } }

  await run(`INSERT INTO users (id, email) VALUES (?, 'x@e.com')`, [OWNER])
  await run(`INSERT INTO channels (id, owner_id, name) VALUES ('ch-x', ?, 'X')`, [OWNER])
  await run(`INSERT INTO cards (id) VALUES ('card-x')`)
  await run(
    `INSERT INTO playground_apps (id, channel_id, card_id, title, code, is_public, share_token,
     ai_spend_limit_cents, ai_customer_limit_cents) VALUES (?, 'ch-x', 'card-x', 'X', 'C', 1, 'tok-x', 1, 100000)`,
    [APP],
  )
  await run(`UPDATE users SET app_ai_spend_limit_cents = 1 WHERE id = ?`, [OWNER])

  const { maximumCostMillicents } = await import('../../lib/playground/aiPricing')
  const period = '2099-01'
  const cost = maximumCostMillicents({
    modelId: 'gemini-2.5-flash', kind: 'text', promptChars: 1000, maxOutputTokens: 3583,
  })!
  const ceiling = 1_000 // one cent, in millicents

  const six = Array.from({ length: 6 }, (_, n) => ({ raw: createClient({ url: FILE }), n }))

  const admitted = await Promise.all(six.map(async (c) => {
    await c.raw.execute('PRAGMA busy_timeout = 15000')
    const spent = Number((await c.raw.execute({
      sql: `SELECT COALESCE(SUM(COALESCE(actual_millicents, reserved_millicents)), 0) AS n
            FROM app_ai_usage WHERE owner_id = ? AND period_key = ? AND status IN ('reserved','settled')`,
      args: [OWNER, period],
    })).rows[0].n)
    if (spent + cost > ceiling) return false
    await c.raw.execute({
      sql: `INSERT INTO app_ai_usage (id, app_id, owner_id, kind, model, is_draft,
             reserved_millicents, status, period_key, created_at)
            VALUES (?, ?, ?, 'text', 'gemini-2.5-flash', 0, ?, 'reserved', ?, ?)`,
      args: [`ctl-${c.n}`, APP, OWNER, cost, period, Math.floor(Date.now() / 1000)],
    })
    return true
  }))

  const got = admitted.filter(Boolean).length
  const rows = Number((await run(`SELECT COUNT(*) AS n FROM app_ai_usage WHERE owner_id = ?`, [OWNER])).rows[0].n)
  console.log(`\nRead-then-write, six independent connections, room for one`)
  console.log(`  admitted: ${got} of 6   ledger rows: ${rows}   reserved: ${rows * cost} of ${ceiling} millicents`)
  console.log(got > 1
    ? '  As expected: the wrong implementation overspends, so the check can fail.'
    : '  Unexpected: even read-then-write admitted one, so this control proves nothing.')
  for (const c of six) c.raw.close()
  process.exit(got > 1 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
