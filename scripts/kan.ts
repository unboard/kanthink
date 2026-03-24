import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import Pusher from 'pusher'

// ── Config ──────────────────────────────────────────────────────────
// Defaults for the Kanthink Work channel — overridden by --channel flag
let CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
let DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
let COMPLETED_COLUMN_ID = 'FaiL-RTAfoEUuyYwhLNAA'
let RAW_IDEAS_COLUMN_ID = '5nI4LkFlS1cF8H1X4wUIV'
const PRODUCTION_URL = 'https://www.kanthink.com'

// Agent identity
const AGENT_ID = 'kan-bugs-agent'
const AGENT_NAME = 'Kan'
const AGENT_IMAGE = 'https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_128,h_128/v1769532115/kanthink-icon_pbne7q.svg'

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

// ── Pusher for real-time events ──────────────────────────────────────
let pusher: Pusher | null = null
function getPusher(): Pusher | null {
  if (pusher) return pusher
  const appId = env.PUSHER_APP_ID
  const key = env.NEXT_PUBLIC_PUSHER_KEY
  const secret = env.PUSHER_SECRET
  const cluster = env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!appId || !key || !secret || !cluster) return null
  pusher = new Pusher({ appId, key, secret, cluster, useTLS: true })
  return pusher
}

async function broadcastToChannel(event: Record<string, unknown>) {
  const p = getPusher()
  if (!p) return
  try {
    await p.trigger(`private-channel-${CHANNEL_ID}`, 'sync', {
      event,
      eventId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: AGENT_ID,
      timestamp: Date.now(),
    })
  } catch (err) {
    // Non-critical — broadcast failure doesn't affect DB operations
    console.warn('[Pusher] Broadcast failed:', (err as Error).message)
  }
}

// ── Ensure agent user exists ─────────────────────────────────────────
async function ensureAgentUser() {
  try {
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [AGENT_ID] })
    if (existing.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO users (id, name, email, image, subscription_status, tier)
              VALUES (?, ?, ?, ?, 'free', 'free')`,
        args: [AGENT_ID, AGENT_NAME, 'kan-bugs@kanthink.local', AGENT_IMAGE],
      })
      console.log('Created agent user: Kan')
    }
  } catch (err) {
    // Ignore if user already exists (race condition)
    console.warn('Agent user check:', (err as Error).message)
  }
}

// ── Message formatting ──────────────────────────────────────────────
interface CardMessage {
  id: string
  type: 'note' | 'question' | 'ai_response'
  content: string
  imageUrls?: string[]
  authorId?: string
  authorName?: string
  authorImage?: string
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
    authorId: AGENT_ID,
    authorName: AGENT_NAME,
    authorImage: AGENT_IMAGE,
    createdAt: new Date().toISOString(),
  })
  const nowEpoch = Math.floor(Date.now() / 1000)
  await db.execute({
    sql: 'UPDATE cards SET messages = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(messages), nowEpoch, cardId],
  })
  // Broadcast real-time update
  await broadcastToChannel({ type: 'card:update', id: cardId, updates: { messages } })
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

  // Broadcast real-time move event
  await broadcastToChannel({ type: 'card:move', cardId, fromColumnId, toColumnId: COMPLETED_COLUMN_ID, channelId: CHANNEL_ID, toIndex: toPosition })
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
    authorId: AGENT_ID,
    authorName: AGENT_NAME,
    authorImage: AGENT_IMAGE,
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

async function tagCard(cardId: string, tagName: string) {
  const res = await db.execute({ sql: 'SELECT tags FROM cards WHERE id = ?', args: [cardId] })
  if (res.rows.length === 0) {
    console.error(`Card not found: ${cardId}`)
    process.exit(1)
  }
  const tags: string[] = JSON.parse((res.rows[0].tags as string) || '[]')
  if (!tags.includes(tagName)) {
    tags.push(tagName)
    const nowEpoch = Math.floor(Date.now() / 1000)

    // If tagging as Processing, also set isProcessing + processingStatus for visual feedback
    const isProcessingTag = tagName === 'Processing'
    if (isProcessingTag) {
      await db.execute({
        sql: 'UPDATE cards SET tags = ?, is_processing = 1, processing_status = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(tags), `${AGENT_NAME} is reviewing...`, nowEpoch, cardId],
      })
      await broadcastToChannel({ type: 'card:update', id: cardId, updates: { tags, isProcessing: true, processingStatus: `${AGENT_NAME} is reviewing...` } })
    } else {
      await db.execute({
        sql: 'UPDATE cards SET tags = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(tags), nowEpoch, cardId],
      })
      await broadcastToChannel({ type: 'card:update', id: cardId, updates: { tags } })
    }
  }
  console.log(`Tagged card ${cardId} with "${tagName}"`)
}

async function describeCard(cardId: string, description: string) {
  const res = await db.execute({ sql: 'SELECT id FROM cards WHERE id = ?', args: [cardId] })
  if (res.rows.length === 0) {
    console.error(`Card not found: ${cardId}`)
    process.exit(1)
  }
  const nowEpoch = Math.floor(Date.now() / 1000)
  await db.execute({
    sql: 'UPDATE cards SET summary = ?, updated_at = ? WHERE id = ?',
    args: [description, nowEpoch, cardId],
  })
  await broadcastToChannel({ type: 'card:update', id: cardId, updates: { summary: description } })
  console.log(`Updated summary for card ${cardId} (keep this SHORT — 1-2 sentences max)`)
}

async function untagCard(cardId: string, tagName: string) {
  const res = await db.execute({ sql: 'SELECT tags FROM cards WHERE id = ?', args: [cardId] })
  if (res.rows.length === 0) {
    console.error(`Card not found: ${cardId}`)
    process.exit(1)
  }
  const tags: string[] = JSON.parse((res.rows[0].tags as string) || '[]')
  const filtered = tags.filter(t => t !== tagName)
  if (filtered.length !== tags.length) {
    const nowEpoch = Math.floor(Date.now() / 1000)

    // If removing Processing tag, clear isProcessing
    const isProcessingTag = tagName === 'Processing'
    if (isProcessingTag) {
      await db.execute({
        sql: 'UPDATE cards SET tags = ?, is_processing = 0, processing_status = NULL, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(filtered), nowEpoch, cardId],
      })
      await broadcastToChannel({ type: 'card:update', id: cardId, updates: { tags: filtered, isProcessing: false, processingStatus: '' } })
    } else {
      await db.execute({
        sql: 'UPDATE cards SET tags = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(filtered), nowEpoch, cardId],
      })
      await broadcastToChannel({ type: 'card:update', id: cardId, updates: { tags: filtered } })
    }
  }
  console.log(`Removed tag "${tagName}" from card ${cardId}`)
}

// ── Column auto-discovery ────────────────────────────────────────────
// When --channel is used, look up columns by name pattern
async function discoverColumns(channelId: string) {
  const res = await db.execute({
    sql: `SELECT id, name FROM columns WHERE channel_id = ? ORDER BY position`,
    args: [channelId],
  })
  if (res.rows.length === 0) {
    console.error(`No columns found for channel ${channelId}. Does this channel exist?`)
    process.exit(1)
  }

  // Match columns by common name patterns
  const find = (patterns: string[]): string | null => {
    for (const pattern of patterns) {
      const match = res.rows.find(r => (r.name as string).toLowerCase().includes(pattern))
      if (match) return match.id as string
    }
    return null
  }

  const doThese = find(['do these', 'inbox', 'to do', 'todo', 'backlog'])
  const completed = find(['completed', 'done', 'complete', 'finished'])
  const rawIdeas = find(['raw ideas', 'ideas', 'triage', 'new'])

  if (!doThese || !completed) {
    console.error(`Could not auto-discover required columns for channel ${channelId}.`)
    console.error(`Found columns: ${res.rows.map(r => `"${r.name}" (${r.id})`).join(', ')}`)
    console.error(`Need a column matching "Do these/Inbox/To do" and one matching "Completed/Done".`)
    process.exit(1)
  }

  CHANNEL_ID = channelId
  DO_THESE_COLUMN_ID = doThese
  COMPLETED_COLUMN_ID = completed
  if (rawIdeas) RAW_IDEAS_COLUMN_ID = rawIdeas

  console.log(`Channel: ${channelId}`)
  console.log(`  Inbox column: ${doThese}`)
  console.log(`  Completed column: ${completed}`)
  if (rawIdeas) console.log(`  Ideas column: ${rawIdeas}`)
  console.log()
}

// ── CLI ─────────────────────────────────────────────────────────────
async function main() {
  await ensureAgentUser()
  let args = process.argv.slice(2)

  // Extract --channel flag before processing other commands
  const channelIdx = args.indexOf('--channel')
  if (channelIdx !== -1 && args[channelIdx + 1]) {
    await discoverColumns(args[channelIdx + 1])
    args = [...args.slice(0, channelIdx), ...args.slice(channelIdx + 2)]
  }

  if (args[0] === '--move' && args[1]) {
    await moveCard(args[1])
  } else if (args[0] === '--note' && args[1]) {
    // Support --note <id> --file <path> for multi-line content
    const fileIdx = args.indexOf('--file')
    let noteText: string
    if (fileIdx !== -1 && args[fileIdx + 1]) {
      noteText = readFileSync(args[fileIdx + 1], 'utf-8')
    } else if (args.slice(2).length > 0) {
      noteText = args.slice(2).filter(a => a !== '--file').join(' ')
    } else {
      console.error('Usage: --note <cardId> <text> OR --note <cardId> --file <path>')
      process.exit(1)
    }
    await addNote(args[1], noteText)
  } else if (args[0] === '--create' && args[1]) {
    // --create <title> --content <content> [--column <columnId>]
    const title = args[1]
    const contentIdx = args.indexOf('--content')
    const columnIdx = args.indexOf('--column')
    const contentEnd = columnIdx > contentIdx ? columnIdx : args.length
    const content = contentIdx !== -1 ? args.slice(contentIdx + 1, contentEnd).join(' ') : ''
    const columnId = columnIdx !== -1 ? args[columnIdx + 1] : RAW_IDEAS_COLUMN_ID
    await createCard(title, content, columnId)
  } else if (args[0] === '--describe' && args[1]) {
    const fileIdx = args.indexOf('--file')
    let descText: string
    if (fileIdx !== -1 && args[fileIdx + 1]) {
      descText = readFileSync(args[fileIdx + 1], 'utf-8')
    } else if (args.slice(2).length > 0) {
      descText = args.slice(2).filter(a => a !== '--file').join(' ')
    } else {
      console.error('Usage: --describe <cardId> <text> OR --describe <cardId> --file <path>')
      process.exit(1)
    }
    await describeCard(args[1], descText)
  } else if (args[0] === '--tag' && args[1] && args[2]) {
    await tagCard(args[1], args.slice(2).join(' '))
  } else if (args[0] === '--untag' && args[1] && args[2]) {
    await untagCard(args[1], args.slice(2).join(' '))
  } else if (args.length === 0) {
    await listCards()
  } else {
    console.log('Usage:')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts                                    # List cards in "Do these"')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --move ID                           # Move card to "Completed"')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --note ID <text>                    # Add a note to a card thread')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --create <title> --content <text>   # Create a card in Raw Ideas')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --tag ID <tag>                      # Add a tag to a card')
    console.log('  npx tsx scripts/read-kanthink-bugs.ts --untag ID <tag>                    # Remove a tag from a card')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
