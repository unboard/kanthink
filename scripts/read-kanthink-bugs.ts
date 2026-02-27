import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Config ──────────────────────────────────────────────────────────
const CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
const COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
const PRODUCTION_URL = 'https://www.kanthink.com'

// ── Load env from .env.local ────────────────────────────────────────
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

// ── Message formatting ──────────────────────────────────────────────
interface CardMessage {
  id: string
  type: 'note' | 'question' | 'ai_response'
  content: string
  imageUrls?: string[]
  createdAt: string
  replyToMessageId?: string
}

function formatMessages(messagesJson: string | null): string {
  if (!messagesJson) return '  (no messages)'
  let messages: CardMessage[]
  try {
    messages = JSON.parse(messagesJson)
  } catch {
    return '  (invalid messages JSON)'
  }
  if (!messages.length) return '  (no messages)'

  return messages.map(m => {
    const lines: string[] = []
    const role = m.type === 'ai_response' ? 'Kan' : m.type === 'question' ? 'Question' : 'Note'
    lines.push(`  [${role}] ${m.content}`)
    if (m.imageUrls?.length) {
      for (const url of m.imageUrls) {
        lines.push(`    Image: ${url}`)
      }
    }
    return lines.join('\n')
  }).join('\n')
}

// ── Commands ────────────────────────────────────────────────────────
async function listCards() {
  const result = await db.execute({
    sql: 'SELECT id, title, messages, cover_image_url, position FROM cards WHERE channel_id = ? AND column_id = ? AND is_archived = 0 ORDER BY position',
    args: [CHANNEL_ID, DO_THESE_COLUMN_ID],
  })

  if (result.rows.length === 0) {
    console.log('No cards in the "Do these" column.')
    return
  }

  console.log(`Found ${result.rows.length} card(s) in "Do these":\n`)

  for (const row of result.rows) {
    console.log(`── Card: ${row.title}`)
    console.log(`   ID: ${row.id}`)
    if (row.cover_image_url) {
      console.log(`   Cover image: ${row.cover_image_url}`)
    }
    console.log(`   Messages:`)
    console.log(formatMessages(row.messages as string | null))
    console.log()
  }
}

async function moveCard(cardId: string) {
  const secret = env.INTERNAL_API_SECRET
  if (!secret) {
    console.error('Error: INTERNAL_API_SECRET not set in .env.local')
    console.error('Add INTERNAL_API_SECRET=<your-secret> to .env.local and Vercel env vars.')
    process.exit(1)
  }

  // Call the production API so it uses the same DB and broadcasts via Pusher
  const res = await fetch(`${PRODUCTION_URL}/api/internal/move-card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ cardId, toColumnId: COMPLETED_COLUMN_ID }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    console.error(`Failed to move card: ${error.error || res.statusText}`)
    process.exit(1)
  }

  const data = await res.json()
  console.log(`Moved card ${cardId} to "Completed" column.`)
  console.log(`  From: ${data.card.fromColumnId} → To: ${data.card.toColumnId}`)
}

// ── CLI ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--move' && args[1]) {
    await moveCard(args[1])
  } else if (args.length === 0) {
    await listCards()
  } else {
    console.log('Usage:')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts           # List cards in "Do these"')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --move ID  # Move card to "Completed"')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
