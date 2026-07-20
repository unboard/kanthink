import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'

const AGENT_ID = 'kan-bugs-agent'
const AGENT_NAME = 'Kan'
const AGENT_IMAGE = 'https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_128,h_128/v1769532115/kanthink-icon_pbne7q.svg'

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
const db = createClient({
  url: env.DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
})

async function main() {
  const nowEpoch = Math.floor(Date.now() / 1000)

  // 1. Archive the verbose reference card
  const refRes = await db.execute({
    sql: `SELECT id, position FROM cards WHERE id = ? AND is_archived = 0`,
    args: ['ref-deploy-1777007743255'],
  })
  if (refRes.rows.length > 0) {
    const pos = refRes.rows[0].position as number
    await db.execute({
      sql: 'UPDATE cards SET is_archived = 1, updated_at = ? WHERE id = ?',
      args: [nowEpoch, 'ref-deploy-1777007743255'],
    })
    await db.execute({
      sql: 'UPDATE cards SET position = position - 1 WHERE column_id = ? AND is_archived = 0 AND position > ?',
      args: [COMPLETED_COLUMN_ID, pos],
    })
    console.log('Archived verbose reference card')
  }

  // 2. Create simple reusable Deploy card at position 0 in Completed
  const id = `deploy-toggle`

  // Shift all Completed cards down by 1
  await db.execute({
    sql: 'UPDATE cards SET position = position + 1 WHERE column_id = ? AND is_archived = 0',
    args: [COMPLETED_COLUMN_ID],
  })

  const messages = [{
    id: `claude-${Date.now()}`,
    type: 'ai_response',
    content: 'Move me to "Do these" to trigger a deploy. /kan will run the deploy and move me back here.',
    authorId: AGENT_ID,
    authorName: AGENT_NAME,
    authorImage: AGENT_IMAGE,
    createdAt: new Date().toISOString(),
  }]

  await db.execute({
    sql: `INSERT INTO cards (id, channel_id, column_id, title, messages, position, source, is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, 'ai', 0, ?, ?)`,
    args: [id, CHANNEL_ID, COMPLETED_COLUMN_ID, '🚀 Deploy', JSON.stringify(messages), nowEpoch, nowEpoch],
  })

  console.log(`Created Deploy toggle card at top of Completed (ID: ${id})`)
}

main().catch(err => { console.error(err); process.exit(1) })
