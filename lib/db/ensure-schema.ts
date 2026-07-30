import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { ALL_STATEMENTS, isBenignMigrationError } from './migrations.mjs'

let ensured = false

/**
 * Request-time safety net for schema migrations.
 *
 * The primary mechanism is the deploy step (`npm run migrate`, wired into `build`),
 * which applies every statement before new code serves a single request. This exists
 * for the cases that bypasses: local dev against a fresh database, and a DB that
 * drifted behind the deployed code.
 *
 * It cannot be the primary mechanism, because it runs too late. `auth()` reads the
 * users table and runs *before* ensureSchema() in most routes, so a migration adding
 * a users column would have a cold-start window where Drizzle SELECTs a column that
 * doesn't exist yet — and since Drizzle names columns explicitly, that fails every
 * query on the table, not just the new feature.
 *
 * Statements come from lib/db/migrations.mjs so this and the deploy step can never
 * disagree about what "migrated" means.
 */
export async function ensureSchema() {
  if (ensured) return

  for (const stmt of ALL_STATEMENTS) {
    try {
      await db.run(sql.raw(stmt))
    } catch (error) {
      // "Already applied" is the normal case on every call after the first. Anything
      // else is logged rather than swallowed silently — a genuinely broken migration
      // used to be indistinguishable from a no-op here.
      if (!isBenignMigrationError(error)) {
        console.error('[ensureSchema] statement failed:', stmt, error)
      }
    }
  }

  ensured = true
}
