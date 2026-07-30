/**
 * Apply pending schema migrations immediately.
 *
 * ensureSchema() normally runs lazily on the first API request that calls it, but
 * `auth()` reads the users table and runs *before* ensureSchema in most routes — so a
 * migration that adds a users column has a cold-start window where Drizzle selects a
 * column the DB doesn't have yet and authenticated requests fail. Running this right
 * after deploying a users/columns migration closes that window.
 *
 *   npx tsx scripts/run-ensure-schema.ts
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const content = readFileSync(resolve(scriptDir, '..', '.env.local'), 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

// The statements this deploy depends on. Kept in sync with lib/db/ensure-schema.ts —
// duplicated rather than imported because that module pulls in the Next-flavoured db
// client, which doesn't load standalone under tsx.
const STATEMENTS = [
  `ALTER TABLE columns ADD sort_order text`,
  `ALTER TABLE users ADD save_default_channel_id text`,
  `ALTER TABLE users ADD save_default_column_id text`,
]

const EXPECTED: Array<[string, string]> = [
  ['columns', 'sort_order'],
  ['users', 'save_default_channel_id'],
  ['users', 'save_default_column_id'],
]

async function main() {
  const env = loadEnv()
  const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  console.log(`Target: ${env.DATABASE_URL}`)

  for (const stmt of STATEMENTS) {
    try {
      await db.execute(stmt)
      console.log(`applied  ${stmt}`)
    } catch (err) {
      // Expected when the column already exists — anything else is worth seeing.
      const message = err instanceof Error ? err.message : String(err)
      console.log(`skipped  ${stmt}  (${message.split('\n')[0]})`)
    }
  }

  let ok = true
  for (const [table, column] of EXPECTED) {
    const info = await db.execute(`PRAGMA table_info(${table})`)
    const found = info.rows.some((r) => (r as unknown as { name: string }).name === column)
    console.log(`${found ? 'OK  ' : 'MISS'} ${table}.${column}`)
    if (!found) ok = false
  }

  if (!ok) process.exit(1)
  console.log('Schema verified.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
