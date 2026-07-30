/**
 * Apply schema migrations. Runs as part of `npm run build`, i.e. before a Vercel
 * deployment goes live.
 *
 * Why this exists as a build step rather than lazily at request time:
 *
 *   `auth()` uses a database session strategy, so it reads the users table — and in
 *   almost every route `auth()` is the first statement, before ensureSchema(). A
 *   migration that adds a users column therefore has a cold-start window where Drizzle
 *   SELECTs a column the database doesn't have. Because Drizzle names every column
 *   explicitly, that doesn't just break the new feature, it breaks every query on the
 *   table. Migrating before traffic arrives removes the race entirely.
 *
 * Deliberately plain ESM run by `node`: no tsx, no ts-node, no transpile step, so the
 * thing standing between a deploy and a broken database has as few moving parts as
 * possible. @libsql/client is already a runtime dependency.
 *
 * Fails closed — a real migration error exits non-zero and takes the build down with
 * it. Shipping code against a database that rejected its migration is the outcome this
 * is here to prevent.
 *
 *   node scripts/migrate.mjs
 */
import { createClient } from '@libsql/client'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ALL_STATEMENTS, REQUIRED_COLUMNS, isBenignMigrationError } from '../lib/db/migrations.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Env comes from the platform in CI (Vercel injects project env vars into the build)
 * and from .env.local when run by hand. process.env wins so CI can't be overridden by
 * a stale local file.
 */
function resolveEnv() {
  const env = { ...process.env }
  const envPath = resolve(ROOT, '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq)
      if (env[key] === undefined) env[key] = trimmed.slice(eq + 1)
    }
  }
  return env
}

async function main() {
  const env = resolveEnv()
  const url = env.DATABASE_URL

  // No database configured — a fresh clone or a CI job without secrets. Skipping keeps
  // `npm run build` working for anyone who just wants to typecheck the app. The remote
  // URL check below is what makes this safe: production always has DATABASE_URL set.
  if (!url) {
    console.log('[migrate] No DATABASE_URL — skipping migrations.')
    return
  }

  // A local file: DB is created and migrated on demand by ensureSchema() in dev.
  if (url.startsWith('file:')) {
    console.log(`[migrate] Local database (${url}) — leaving it to ensureSchema().`)
    return
  }

  console.log(`[migrate] Target: ${url}`)
  const db = createClient({ url, authToken: env.TURSO_AUTH_TOKEN })

  let applied = 0
  for (const stmt of ALL_STATEMENTS) {
    try {
      await db.execute(stmt)
      applied++
    } catch (error) {
      if (isBenignMigrationError(error)) continue
      console.error(`\n[migrate] FAILED: ${stmt}\n`)
      throw error
    }
  }
  console.log(`[migrate] ${applied} statement(s) applied, ${ALL_STATEMENTS.length - applied} already current.`)

  // Assert the schema actually matches what the code about to ship expects. Without
  // this, a swallowed error means we'd deploy against a database missing a column.
  const missing = []
  const columnsByTable = new Map()
  for (const [table, column] of REQUIRED_COLUMNS) {
    if (!columnsByTable.has(table)) {
      const info = await db.execute(`PRAGMA table_info(${table})`)
      columnsByTable.set(table, new Set(info.rows.map((r) => r.name)))
    }
    if (!columnsByTable.get(table).has(column)) missing.push(`${table}.${column}`)
  }

  if (missing.length > 0) {
    console.error(`\n[migrate] Schema check failed. Missing column(s):\n  ${missing.join('\n  ')}\n`)
    throw new Error(`${missing.length} required column(s) missing after migration`)
  }

  console.log(`[migrate] Schema verified — ${REQUIRED_COLUMNS.length} required columns present.`)
}

main().catch((error) => {
  console.error('[migrate] Migration failed. Build aborted so the app is not deployed against a stale schema.')
  console.error(error)
  process.exit(1)
})
