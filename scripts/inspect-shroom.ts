/**
 * Print how a shroom is actually stored — triggers, enabled flag, email config.
 *
 * The drawer can look correctly configured while the row behind it says otherwise
 * (that was the old "Run automatically" checkbox's whole problem), so this reads the
 * database rather than the UI.
 *
 *   npx tsx scripts/inspect-shroom.ts "Inbox Analyzer"
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
  const search = process.argv[2] ?? ''

  const res = await db.execute({
    sql: `SELECT id, title, channel_id, action, is_enabled, triggers, safeguards,
                 email_config, next_scheduled_run, last_executed_at, daily_execution_count,
                 execution_history
          FROM instruction_cards
          WHERE title LIKE ?`,
    args: [`%${search}%`],
  })

  if (res.rows.length === 0) {
    console.log(`No shroom matching "${search}"`)
    process.exit(0)
  }

  for (const row of res.rows) {
    const parse = (v: unknown) => {
      if (typeof v !== 'string') return v
      try { return JSON.parse(v) } catch { return v }
    }
    const ts = (v: unknown) => (typeof v === 'number' ? new Date(v * 1000).toISOString() : v)

    console.log('─'.repeat(60))
    console.log(`${row.title}   (${row.id})`)
    console.log(`  action:            ${row.action}`)
    console.log(`  isEnabled:         ${row.is_enabled}`)
    console.log(`  triggers:          ${JSON.stringify(parse(row.triggers))}`)
    console.log(`  safeguards:        ${JSON.stringify(parse(row.safeguards))}`)
    console.log(`  emailConfig:       ${JSON.stringify(parse(row.email_config))}`)
    console.log(`  nextScheduledRun:  ${ts(row.next_scheduled_run)}`)
    console.log(`  lastExecutedAt:    ${ts(row.last_executed_at)}`)
    console.log(`  dailyRunCount:     ${row.daily_execution_count}`)
    const history = parse(row.execution_history)
    if (Array.isArray(history) && history.length > 0) {
      console.log(`  recent runs:`)
      for (const h of history.slice(-5)) {
        console.log(`    ${h.timestamp}  via ${h.triggeredBy}  success=${h.success}  cards=${h.cardsAffected}`)
      }
    } else {
      console.log(`  recent runs:       none recorded`)
    }
  }

}

main()
