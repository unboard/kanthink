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

const title = '📌 Refresh env workflow'

const noteContent = `This pinned card is a reference for handling environment variable changes.

**When to use this:**
You just added or changed an environment variable in the Vercel dashboard (Settings → Environment Variables).

**How to trigger a refresh:**
1. From your phone, create a card in the "Do these" column with the title: \`Refresh env\`
2. On the next \`/kan\` run, Kan will pull the latest env vars from Vercel **before** building and deploying
3. The \`Refresh env\` card gets moved to Completed like any other work card

**Why not auto-pull every deploy?**
Pulling secrets on every deploy is wasteful (most deploys don't need fresh env) and a small security nit (secrets flowing over the network more than needed). Making it explicit means the pull only happens when you actually changed something.

**How to know you need this:**
If you added/changed an env var in the Vercel dashboard, your next deploy will still use the previously cached value until you trigger a refresh via the card above.

**Under the hood:**
The refresh runs \`vercel pull --environment=production --yes\`, which writes to \`.vercel/.env.production.local\` (never touches your local \`.env.local\` dev file).`

async function main() {
  const id = `ref-env-${Date.now()}`
  const nowEpoch = Math.floor(Date.now() / 1000)

  // Shift all cards in Completed down by 1
  await db.execute({
    sql: 'UPDATE cards SET position = position + 1 WHERE column_id = ? AND is_archived = 0',
    args: [COMPLETED_COLUMN_ID],
  })

  const messages = [{
    id: `claude-${Date.now()}`,
    type: 'ai_response',
    content: noteContent,
    authorId: AGENT_ID,
    authorName: AGENT_NAME,
    authorImage: AGENT_IMAGE,
    createdAt: new Date().toISOString(),
  }]

  await db.execute({
    sql: `INSERT INTO cards (id, channel_id, column_id, title, messages, position, source, is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, 'ai', 0, ?, ?)`,
    args: [id, CHANNEL_ID, COMPLETED_COLUMN_ID, title, JSON.stringify(messages), nowEpoch, nowEpoch],
  })

  console.log(`Created pinned reference card in Completed (position 0)`)
  console.log(`  ID: ${id}`)
  console.log(`  Title: ${title}`)
}

main().catch(err => { console.error(err); process.exit(1) })
