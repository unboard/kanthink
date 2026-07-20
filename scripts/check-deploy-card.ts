import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'

const env: Record<string, string> = {}
for (const l of readFileSync('C:/code/kanthink/.env.local', 'utf-8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i)] = t.slice(i + 1)
}

const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const COMPLETED = 'FaiL-RTAfoEUuyYwhLNAA'

async function main() {
  const nowEpoch = Math.floor(Date.now() / 1000)

  // Get the stray Deploy card's position
  const res = await db.execute({
    sql: `SELECT id, position FROM cards WHERE id = ? AND is_archived = 0`,
    args: ['deploy-1777007546887'],
  })
  if (res.rows.length === 0) {
    console.log('Already archived')
    return
  }
  const pos = res.rows[0].position as number

  // Archive it
  await db.execute({
    sql: 'UPDATE cards SET is_archived = 1, updated_at = ? WHERE id = ?',
    args: [nowEpoch, 'deploy-1777007546887'],
  })

  // Shift remaining Completed cards up to close the gap
  await db.execute({
    sql: 'UPDATE cards SET position = position - 1 WHERE column_id = ? AND is_archived = 0 AND position > ?',
    args: [COMPLETED, pos],
  })

  console.log(`Archived stray Deploy card (was at position ${pos} in Completed)`)
}
main()
