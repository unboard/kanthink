#!/usr/bin/env node
/**
 * Claude Code hook: tells Kanthink this session is open, working, idle or closed,
 * so the city can say whether Claude Code is online right now.
 *
 * Wired in .claude/settings.local.json for SessionStart, UserPromptSubmit, Stop and
 * SessionEnd. On SessionStart and UserPromptSubmit it also prints any cards added to
 * Work → Do these since the session last heard, which Claude Code reads as context:
 * that's how a note left from the city reaches a session that's open.
 *
 * Never fails the session: any error is swallowed and it exits 0.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const WORK_CHANNEL_ID = '64eQst0Zx_iYYN4QJLWw3'
const DO_THESE_COLUMN_ID = 'nRPnpAXt9pK2w_e4Iqicm'
const STATE = { SessionStart: 'idle', UserPromptSubmit: 'working', Stop: 'idle', SessionEnd: 'closed' }

function env() {
  const out = {}
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    const i = t.indexOf('=')
    if (t && !t.startsWith('#') && i > 0) out[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
  }
  return out
}

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const hook = JSON.parse(input || '{}')
  const event = hook.hook_event_name
  const state = STATE[event]
  if (!state || !hook.session_id) return

  const e = env()
  const db = createClient({ url: e.DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN })
  try { await run(db, hook, event, state) } finally { db.close() }
}

async function run(db, hook, event, state) {
  // Two round trips: who owns Work and what this session last heard, then everything else.
  const [ownerRes, rowRes] = await db.batch([
    { sql: 'SELECT owner_id FROM channels WHERE id = ?', args: [WORK_CHANNEL_ID] },
    { sql: 'SELECT announced_at FROM claude_sessions WHERE id = ?', args: [hook.session_id] },
  ], 'read')
  const owner = ownerRes.rows[0]?.owner_id
  if (!owner) return
  const now = Math.floor(Date.now() / 1000)
  const tell = event === 'SessionStart' || event === 'UserPromptSubmit'
  // A new session hears about the last day; after that, only what's new.
  const since = event === 'SessionStart' || rowRes.rows[0]?.announced_at == null ? now - 86400 : Number(rowRes.rows[0].announced_at)

  const results = await db.batch([
    {
      sql: `INSERT INTO claude_sessions (id, owner_id, state, cwd, started_at, last_seen_at, ended_at, announced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET state = excluded.state, last_seen_at = excluded.last_seen_at, ended_at = excluded.ended_at${tell ? ', announced_at = excluded.announced_at' : ''}`,
      args: [hook.session_id, owner, state, hook.cwd ?? null, now, now, state === 'closed' ? now : null, now],
    },
    ...(tell ? [{
      sql: 'SELECT title FROM cards WHERE channel_id = ? AND column_id = ? AND is_archived = 0 AND created_at > ? ORDER BY created_at DESC LIMIT 8',
      args: [WORK_CHANNEL_ID, DO_THESE_COLUMN_ID, since],
    }] : []),
  ], 'write')
  const fresh = tell ? results[1].rows : []
  if (!fresh.length) return
  // Printed on these two events, Claude Code reads it as context for the turn.
  const titles = fresh.map((r) => `“${r.title}”`).join(', ')
  console.log(`Kanthink: ${fresh.length} new card${fresh.length === 1 ? '' : 's'} in Work → Do these${event === 'SessionStart' ? ' from the last day' : ' since your last turn'}: ${titles}. These may be notes the user left for Claude Code from Kan City. Mention them briefly to the user; read them with \`npx tsx scripts/kan.ts\` when the user wants them worked.`)
}

// No process.exit: on Windows it can trip libuv while the client's socket is closing.
main().catch(() => {})
