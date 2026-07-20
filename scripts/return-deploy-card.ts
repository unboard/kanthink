import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
const DEPLOY_CARD_ID = 'deploy-toggle'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
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

const env = loadEnv()
const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

async function main() {
  const nowEpoch = Math.floor(Date.now() / 1000)

  // Get card's current column and position
  const cur = await db.execute({
    sql: 'SELECT column_id, position FROM cards WHERE id = ? AND is_archived = 0',
    args: [DEPLOY_CARD_ID],
  })
  if (cur.rows.length === 0) {
    console.error(`Deploy card not found (id: ${DEPLOY_CARD_ID})`)
    process.exit(1)
  }
  const fromColumn = cur.rows[0].column_id as string
  const fromPos = cur.rows[0].position as number

  // Shift cards in source column to close the gap
  await db.execute({
    sql: 'UPDATE cards SET position = position - 1 WHERE column_id = ? AND is_archived = 0 AND position > ?',
    args: [fromColumn, fromPos],
  })

  // Shift all Completed cards down by 1 to make room at top
  await db.execute({
    sql: 'UPDATE cards SET position = position + 1 WHERE column_id = ? AND is_archived = 0',
    args: [COMPLETED_COLUMN_ID],
  })

  // Move Deploy card to position 0 in Completed
  await db.execute({
    sql: 'UPDATE cards SET column_id = ?, position = 0, updated_at = ? WHERE id = ?',
    args: [COMPLETED_COLUMN_ID, nowEpoch, DEPLOY_CARD_ID],
  })

  console.log('Deploy card returned to top of Completed')
}

main().catch(err => { console.error(err); process.exit(1) })
