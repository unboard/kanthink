/**
 * Clear cards left shimmering by a build that finished without a tab open.
 *
 * The cause is fixed in app/api/playground/generate/route.ts, but rows already
 * carrying the flag will not clear themselves — nothing revisits them.
 *
 *   node .verify/clear-stuck-builds.mjs        — list them
 *   node .verify/clear-stuck-builds.mjs --fix  — clear them
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

// Anything still "processing" after this long is not still processing. The longest
// real build is a few minutes against an 800s route ceiling.
const STALE_SECONDS = 30 * 60
const cutoff = Math.floor(Date.now() / 1000) - STALE_SECONDS

const { rows } = await client.execute({
  sql: `SELECT c.id, c.title, c.processing_status, c.updated_at, ch.name AS channel
        FROM cards c JOIN channels ch ON ch.id = c.channel_id
        WHERE c.is_processing = 1 AND (c.updated_at IS NULL OR c.updated_at < ?)
        ORDER BY c.updated_at`,
  args: [cutoff],
})

if (!rows.length) { console.log('No stuck cards.'); process.exit(0) }

console.log(`${rows.length} card(s) stuck longer than ${STALE_SECONDS / 60} minutes:\n`)
for (const r of rows) {
  const age = r.updated_at ? Math.round((Date.now() / 1000 - r.updated_at) / 3600) : null
  console.log(`  ${r.channel} / ${r.title}`)
  console.log(`    status: ${r.processing_status ?? '(none)'}${age !== null ? `   stuck ~${age}h` : ''}`)
}

if (process.argv.includes('--fix')) {
  for (const r of rows) {
    await client.execute({
      sql: `UPDATE cards SET is_processing = 0, processing_status = NULL WHERE id = ?`,
      args: [r.id],
    })
  }
  console.log(`\nCleared ${rows.length}. Reload the board to see it.`)
} else {
  console.log('\nRe-run with --fix to clear them.')
}
process.exit(0)
