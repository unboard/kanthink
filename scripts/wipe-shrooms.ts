/**
 * Delete every shroom in the database.
 *
 * Written for a deliberate reset while the shroom model was being reshaped: the stored
 * rows predate capabilities, input requirements and scope-free instructions, and their
 * prose still restates columns. Starting empty is cheaper than migrating them.
 *
 * Prints what it is about to remove and requires --confirm to actually do it, because
 * "list the damage first" is the only safeguard a wipe script can usefully have.
 *
 *   npx tsx scripts/wipe-shrooms.ts            # dry run — lists what would go
 *   npx tsx scripts/wipe-shrooms.ts --confirm  # deletes
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
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

const env = loadEnv()
const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

async function main() {
  const confirmed = process.argv.includes('--confirm')

  const rows = await db.execute(`
    SELECT ic.id, ic.title, ic.action, ic.is_global_resource, ic.is_enabled,
           c.name AS channel_name, u.email AS owner_email
    FROM instruction_cards ic
    LEFT JOIN channels c ON c.id = ic.channel_id
    LEFT JOIN users u ON u.id = c.owner_id
    ORDER BY u.email, c.name, ic.position
  `)

  if (rows.rows.length === 0) {
    console.log('No shrooms in the database. Nothing to do.')
    return
  }

  console.log(`${rows.rows.length} shroom(s):\n`)
  const owners = new Set<string>()
  for (const r of rows.rows) {
    const owner = (r.owner_email as string) ?? 'unknown owner'
    owners.add(owner)
    const flags = [
      r.is_global_resource ? 'GLOBAL' : null,
      r.is_enabled ? 'automatic' : null,
    ].filter(Boolean).join(', ')
    console.log(
      `  ${String(r.title)}  [${String(r.action)}]${flags ? ` (${flags})` : ''}` +
      `\n      channel: ${String(r.channel_name ?? '—')}  ·  owner: ${owner}`
    )
  }

  console.log(`\nAcross ${owners.size} owner(s): ${[...owners].join(', ')}`)

  // Cards remember which shroom made them and which run they belong to. Those columns
  // are plain text, not foreign keys, so deleting shrooms leaves the references dangling
  // rather than cascading — worth saying out loud before anyone runs this.
  const made = await db.execute(`
    SELECT COUNT(*) AS n FROM cards WHERE created_by_instruction_id IS NOT NULL
  `)
  console.log(`${made.rows[0]?.n ?? 0} card(s) record a shroom as their creator; those references will dangle.`)

  if (!confirmed) {
    console.log('\nDry run. Re-run with --confirm to delete.')
    return
  }

  const result = await db.execute('DELETE FROM instruction_cards')
  console.log(`\nDeleted ${result.rowsAffected} shroom(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
