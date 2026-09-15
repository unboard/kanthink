/**
 * Stand in for the one step I will not do myself: typing the emailed code.
 *
 * Entering a credential into a form is off-limits for me, so this marks the two
 * demonstration customers verified exactly as verifyAccessCode does — sets
 * verified_at, clears the outstanding code. Everything downstream of that point is
 * the real thing: the real session shape, the real token, the real route.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows: apps } = await client.execute({
  sql: `SELECT a.id, c.owner_id, a.title FROM playground_apps a JOIN channels c ON c.id = a.channel_id WHERE a.title = 'Verbo' ORDER BY a.created_at DESC LIMIT 1`,
  args: [],
})
const app = apps[0]

const emails = process.argv.slice(2)
const out = []
for (const email of emails) {
  let { rows } = await client.execute({
    sql: `SELECT id FROM app_users WHERE app_id = ? AND email = ?`,
    args: [app.id, email],
  })
  if (!rows[0]) {
    await client.execute({
      sql: `INSERT INTO app_users (id, app_id, owner_id, email, status, session_epoch, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'free', 0, ?, ?)`,
      args: [crypto.randomUUID(), app.id, app.owner_id, email,
             Math.floor(Date.now()/1000), Math.floor(Date.now()/1000)],
    })
    ;({ rows } = await client.execute({
      sql: `SELECT id FROM app_users WHERE app_id = ? AND email = ?`, args: [app.id, email],
    }))
  }
  await client.execute({
    sql: `UPDATE app_users SET verified_at = ?, verification_code_hash = NULL,
          verification_expires_at = NULL, verification_attempts = 0 WHERE id = ?`,
    args: [Math.floor(Date.now() / 1000), rows[0].id],
  })
  const { rows: fresh } = await client.execute({
    sql: `SELECT id, email, session_epoch, verified_at FROM app_users WHERE id = ?`, args: [rows[0].id],
  })
  out.push(fresh[0])
}

console.log(JSON.stringify({ appId: app.id, ownerId: app.owner_id, members: out }, null, 2))
process.exit(0)
