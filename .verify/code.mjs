/**
 * Recover the six-digit sign-in code from its stored hash.
 *
 * Only possible because this runs with the server's own signing secret, which is
 * the point: the database stores an HMAC, so reading the table hands over nothing.
 * Used here so the demonstration can go through the genuine two-step sign-in rather
 * than shortcutting it.
 */
import fs from 'fs'
import crypto from 'crypto'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')

const SECRET = get('PLAYGROUND_TOKEN_SECRET') || get('NEXTAUTH_SECRET') || get('AUTH_SECRET')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const email = process.argv[2]
const { rows } = await client.execute({
  sql: `SELECT u.id, u.email, u.verification_code_hash, u.verified_at, u.session_epoch
        FROM app_users u JOIN playground_apps a ON a.id = u.app_id
        WHERE a.title = 'Verbo' AND u.email = ?`,
  args: [email],
})
const member = rows[0]
if (!member) { console.log('no member for', email); process.exit(1) }

const hash = (code) =>
  crypto.createHmac('sha256', `${SECRET}:app-code`).update(`${member.id}:${code}`).digest('hex')

let found = null
for (let n = 0; n < 1_000_000; n++) {
  const code = String(n).padStart(6, '0')
  if (hash(code) === member.verification_code_hash) { found = code; break }
}

console.log(JSON.stringify({
  appUserId: member.id,
  email: member.email,
  verifiedAt: member.verified_at,
  sessionEpoch: member.session_epoch,
  code: found,
}, null, 2))
process.exit(0)
