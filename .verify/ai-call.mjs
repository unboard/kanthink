/**
 * Call /api/playground/ai exactly as a published app does.
 *
 * The app swallows failures and shows canned comments, so a broken endpoint and a
 * working one look identical from the outside. This asks it directly.
 */
import fs from 'fs'
import crypto from 'crypto'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SECRET = get('PLAYGROUND_TOKEN_SECRET') || get('NEXTAUTH_SECRET') || get('AUTH_SECRET')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT id, title, app_token FROM playground_apps WHERE title LIKE ? LIMIT 1`,
  args: [process.argv[2] ?? '%Launch Simulator%'],
})
const app = rows[0]

// Same token the srcdoc carries.
const hmac = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("hex").slice(0, 32)
const liveToken = app.app_token || `${app.id}.${hmac(app.id)}`
const draftToken = `${app.id}.draft.${hmac("draft:" + app.id)}`
const appToken = process.env.USE_DRAFT ? draftToken : liveToken

const ORIGIN = process.env.TEST_ORIGIN ?? 'https://www.kanthink.com'

const payload = {
  appToken,
  prompt: 'Create simulated Twitter replies for this product launch post: "A new AI notebook". Return 6 to 10 realistic replies.',
  model: 'gemini-3.1-pro-preview',
  jsonSchema: {
    type: 'OBJECT',
    properties: {
      replies: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { name: { type: 'STRING' }, handle: { type: 'STRING' }, text: { type: 'STRING' } },
          required: ['name', 'handle', 'text'],
        },
      },
    },
    required: ['replies'],
  },
}

console.log(`POST ${ORIGIN}/api/playground/ai   app="${app.title}"  model=${payload.model}\n`)
const res = await fetch(`${ORIGIN}/api/playground/ai`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
const text = await res.text()
console.log('HTTP', res.status)
console.log(text.slice(0, 1200))
process.exit(0)
