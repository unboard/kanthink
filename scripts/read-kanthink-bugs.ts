import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Config ──────────────────────────────────────────────────────────
const CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
const COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
const RAW_IDEAS_COLUMN_ID = '5nI4LkFlS1cF8H1X4wUIV'
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

async function addNote(cardId: string, noteText: string) {
  const res = await db.execute({ sql: 'SELECT messages FROM cards WHERE id = ?', args: [cardId] })
  if (res.rows.length === 0) {
    console.error(`Card not found: ${cardId}`)
    process.exit(1)
  }
  const messages: CardMessage[] = JSON.parse((res.rows[0].messages as string) || '[]')
  messages.push({
    id: `claude-${Date.now()}`,
    type: 'ai_response',
    content: noteText,
    createdAt: new Date().toISOString(),
  })
  const nowEpoch = Math.floor(Date.now() / 1000)
  await db.execute({
    sql: 'UPDATE cards SET messages = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(messages), nowEpoch, cardId],
  })
  console.log(`Added note to card ${cardId}`)
}

async function moveCard(cardId: string) {
  // Get the card
  const cardRes = await db.execute({ sql: 'SELECT column_id, position FROM cards WHERE id = ?', args: [cardId] })
  if (cardRes.rows.length === 0) {
    console.error(`Card not found: ${cardId}`)
    process.exit(1)
  }
  const fromColumnId = cardRes.rows[0].column_id as string
  const fromPosition = cardRes.rows[0].position as number

  // Get next position in Completed column
  const maxRes = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) as max_pos FROM cards WHERE column_id = ? AND is_archived = 0',
    args: [COMPLETED_COLUMN_ID],
  })
  const toPosition = Number(maxRes.rows[0].max_pos) + 1
  const nowEpoch = Math.floor(Date.now() / 1000)

  // Shift positions in the source column
  await db.execute({
    sql: 'UPDATE cards SET position = position - 1 WHERE column_id = ? AND is_archived = 0 AND position > ?',
    args: [fromColumnId, fromPosition],
  })

  // Move the card (updated_at as epoch integer to match Drizzle's format)
  await db.execute({
    sql: 'UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
    args: [COMPLETED_COLUMN_ID, toPosition, nowEpoch, cardId],
  })

  console.log(`Moved card ${cardId} to "Completed" column.`)
  console.log(`  From: ${fromColumnId} → To: ${COMPLETED_COLUMN_ID}`)
}

async function createCard(title: string, content: string, columnId: string = RAW_IDEAS_COLUMN_ID) {
  const id = `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const nowEpoch = Math.floor(Date.now() / 1000)

  // Get next position in target column
  const maxRes = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) as max_pos FROM cards WHERE column_id = ? AND is_archived = 0',
    args: [columnId],
  })
  const position = Number(maxRes.rows[0].max_pos) + 1

  const messages: CardMessage[] = [{
    id: `claude-${Date.now()}`,
    type: 'ai_response',
    content: content,
    createdAt: new Date().toISOString(),
  }]

  await db.execute({
    sql: `INSERT INTO cards (id, channel_id, column_id, title, messages, position, source, is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'ai', 0, ?, ?)`,
    args: [id, CHANNEL_ID, columnId, title, JSON.stringify(messages), position, nowEpoch, nowEpoch],
  })

  console.log(`Created card "${title}" in column (${columnId})`)
  console.log(`  ID: ${id}`)
}

// ── CLI ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--move' && args[1]) {
    await moveCard(args[1])
  } else if (args[0] === '--note' && args[1] && args.slice(2).length > 0) {
    await addNote(args[1], args.slice(2).join(' '))
  } else if (args[0] === '--create' && args[1]) {
    // --create <title> --content <content> [--column <columnId>]
    const title = args[1]
    const contentIdx = args.indexOf('--content')
    const columnIdx = args.indexOf('--column')
    const contentEnd = columnIdx > contentIdx ? columnIdx : args.length
    const content = contentIdx !== -1 ? args.slice(contentIdx + 1, contentEnd).join(' ') : ''
    const columnId = columnIdx !== -1 ? args[columnIdx + 1] : RAW_IDEAS_COLUMN_ID
    await createCard(title, content, columnId)
  } else if (args.length === 0) {
    await listCards()
  } else {
    console.log('Usage:')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts                                    # List cards in "Do these"')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --move ID                           # Move card to "Completed"')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --note ID <text>                    # Add a note to a card thread')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --create <title> --content <text>   # Create a card in Raw Ideas')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
