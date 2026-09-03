import { createClient } from '@libsql/client'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// â”€â”€ Config (match scripts/kan.ts agent identity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AGENT_ID and AGENT_EMAIL are load-bearing keys: the live users row, its session and
// its channel_shares all hang off them, and scripts/kan.ts matches the same id. They
// keep the historical 'kan-bugs' naming on purpose. Only AGENT_NAME is user-facing, and
// it reads "Grok" so the seat isn't mistaken for Kan, the product's own assistant.
const AGENT_ID = 'kan-bugs-agent'
const AGENT_NAME = 'Grok'
const AGENT_EMAIL = 'kan-bugs@kanthink.local'
const AGENT_IMAGE =
  'https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_128,h_128/v1769532115/kanthink-icon_pbne7q.svg'
const CHANNEL_ID = 'B3sKLmb4J0ttTI_asXbji'
const PARENT_EMAILS = ['dhodg22@gmail.com', 'dustin@mycreativeshop.com']
const SESSION_DAYS = 30

// â”€â”€ Load env from .env.local (same pattern as scripts/kan.ts) â”€â”€â”€â”€â”€â”€â”€â”€
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

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000)
}

function sessionCookieName(): string {
  // This seed is for production https://www.kanthink.com. Auth.js sets
  // useSecureCookies from the request URL protocol (init.js: url.protocol === "https:"),
  // so production cookies are prefixed __Secure- regardless of local NEXTAUTH_URL.
  // Agent browser login (server Set-Cookie, not CDP):
  // https://www.kanthink.com/api/auth/agent?t=SESSION_TOKEN
  return '__Secure-authjs.session-token'
}

async function tableColumns(table: string): Promise<Set<string>> {
  const info = await db.execute(`PRAGMA table_info(${table})`)
  return new Set(info.rows.map((r) => String(r.name)))
}

async function main() {
  const usersCols = await tableColumns('users')
  const sharesCols = await tableColumns('channel_shares')
  const sessionsCols = await tableColumns('sessions')
  const orgCols = await tableColumns('user_channel_org')

  const hasParentUserId = usersCols.has('parent_user_id')
  const hasKind = usersCols.has('kind')
  const notes: string[] = []
  if (!hasParentUserId) notes.push('users.parent_user_id missing â€” skipped')
  if (!hasKind) notes.push('users.kind missing â€” skipped')

  // Parent by email; do not hardcode a user id.
  const parentRes = await db.execute({
    sql: `SELECT id, email FROM users WHERE email IN (${PARENT_EMAILS.map(() => '?').join(', ')})`,
    args: PARENT_EMAILS,
  })
  const parentId = parentRes.rows[0] ? String(parentRes.rows[0].id) : null
  if (!parentId) notes.push('parent user not found by email â€” invited_by left null')

  // â”€â”€ Ensure agent user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE id = ?',
    args: [AGENT_ID],
  })
  const userExisted = existing.rows.length > 0

  if (!userExisted) {
    await db.execute({
      sql: `INSERT INTO users (id, name, email, image, subscription_status, tier)
            VALUES (?, ?, ?, ?, 'free', 'free')`,
      args: [AGENT_ID, AGENT_NAME, AGENT_EMAIL, AGENT_IMAGE],
    })
  } else {
    await db.execute({
      sql: 'UPDATE users SET name = ?, image = ? WHERE id = ?',
      args: [AGENT_NAME, AGENT_IMAGE, AGENT_ID],
    })
  }

  if (hasParentUserId || hasKind) {
    const sets: string[] = []
    const args: Array<string | null> = []
    if (hasParentUserId) {
      sets.push('parent_user_id = ?')
      args.push(parentId)
    }
    if (hasKind) {
      sets.push('kind = ?')
      args.push('agent')
    }
    args.push(AGENT_ID)
    await db.execute({
      sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      args,
    })
  }

  // â”€â”€ Ensure editor share on the Grok channel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let shareOk = false
  try {
    const shareExisting = await db.execute({
      sql: 'SELECT id, role, accepted_at FROM channel_shares WHERE channel_id = ? AND user_id = ?',
      args: [CHANNEL_ID, AGENT_ID],
    })
    const now = nowEpoch()
    const invitedByCol = sharesCols.has('invited_by')
    const invitedAtCol = sharesCols.has('invited_at')
    const acceptedAtCol = sharesCols.has('accepted_at')
    const createdAtCol = sharesCols.has('created_at')
    const emailCol = sharesCols.has('email')

    if (shareExisting.rows.length === 0) {
      const cols = ['id', 'channel_id', 'user_id', 'role']
      const vals: Array<string | number | null> = [randomUUID(), CHANNEL_ID, AGENT_ID, 'editor']
      if (emailCol) {
        cols.push('email')
        vals.push(AGENT_EMAIL)
      }
      if (invitedByCol) {
        cols.push('invited_by')
        vals.push(parentId)
      }
      if (invitedAtCol) {
        cols.push('invited_at')
        vals.push(now)
      }
      if (acceptedAtCol) {
        cols.push('accepted_at')
        vals.push(now)
      }
      if (createdAtCol) {
        cols.push('created_at')
        vals.push(now)
      }
      try {
        await db.execute({
          sql: `INSERT INTO channel_shares (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          args: vals,
        })
      } catch (err) {
        const msg = (err as Error).message || ''
        if (!msg.includes('UNIQUE constraint')) throw err
        await db.execute({
          sql: `UPDATE channel_shares SET role = ?, accepted_at = COALESCE(accepted_at, ?) WHERE channel_id = ? AND user_id = ?`,
          args: ['editor', now, CHANNEL_ID, AGENT_ID],
        })
      }
    } else {
      const updates: string[] = ['role = ?']
      const args: Array<string | number | null> = ['editor']
      if (acceptedAtCol && shareExisting.rows[0].accepted_at == null) {
        updates.push('accepted_at = ?')
        args.push(now)
      }
      args.push(CHANNEL_ID, AGENT_ID)
      await db.execute({
        sql: `UPDATE channel_shares SET ${updates.join(', ')} WHERE channel_id = ? AND user_id = ?`,
        args,
      })
    }

    const verify = await db.execute({
      sql: `SELECT id FROM channel_shares WHERE channel_id = ? AND user_id = ? AND role = 'editor' AND accepted_at IS NOT NULL`,
      args: [CHANNEL_ID, AGENT_ID],
    })
    shareOk = verify.rows.length > 0

    // Mirror app share-create: put the channel in the agent's sidebar.
    if (orgCols.has('id') && orgCols.has('user_id') && orgCols.has('channel_id')) {
      const orgExisting = await db.execute({
        sql: 'SELECT id FROM user_channel_org WHERE user_id = ? AND channel_id = ?',
        args: [AGENT_ID, CHANNEL_ID],
      })
      if (orgExisting.rows.length === 0) {
        const maxPos = await db.execute({
          sql: 'SELECT COALESCE(MAX(position), -1) as max_pos FROM user_channel_org WHERE user_id = ?',
          args: [AGENT_ID],
        })
        const position = Number(maxPos.rows[0]?.max_pos ?? -1) + 1
        const orgColsInsert = ['id', 'user_id', 'channel_id', 'position']
        const orgVals: Array<string | number> = [randomUUID(), AGENT_ID, CHANNEL_ID, position]
        if (orgCols.has('created_at')) {
          orgColsInsert.push('created_at')
          orgVals.push(now)
        }
        await db.execute({
          sql: `INSERT INTO user_channel_org (${orgColsInsert.join(', ')}) VALUES (${orgColsInsert.map(() => '?').join(', ')})`,
          args: orgVals,
        })
      }
    }
  } catch (err) {
    shareOk = false
    notes.push(`share error: ${(err as Error).message}`)
  }

  // â”€â”€ NextAuth v5 database session (sessions.session_token / user_id / expires) â”€â”€
  if (!sessionsCols.has('session_token') || !sessionsCols.has('user_id') || !sessionsCols.has('expires')) {
    throw new Error('sessions table missing session_token/user_id/expires')
  }
  const sessionToken = randomUUID()
  const expires = nowEpoch() + SESSION_DAYS * 24 * 60 * 60
  await db.execute({
    sql: 'INSERT INTO sessions (session_token, user_id, expires) VALUES (?, ?, ?)',
    args: [sessionToken, AGENT_ID, expires],
  })

  for (const n of notes) {
    console.error(`SCHEMA_NOTE ${n}`)
  }
  console.error(`user_existed=${userExisted}`)

  console.log(`agent_user_id=${AGENT_ID}`)
  console.log(`share_ok=${shareOk}`)
  console.log(`cookie_name=${sessionCookieName()}`)
  console.log(`SESSION_TOKEN=${sessionToken}`)
}

main().catch((err) => {
  console.error('SEED_ERROR', (err as Error).message)
  process.exit(1)
})


