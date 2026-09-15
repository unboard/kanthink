// Read the just-built app straight from the production database, so the generated
// code can be inspected as text rather than through a blocked page script.
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')

const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT id, title, share_token, is_public, published_version_id, generation_count,
               price_amount, price_currency, LENGTH(code) AS code_len, code
        FROM playground_apps WHERE title = ? ORDER BY created_at DESC LIMIT 1`,
  args: [process.argv[2] ?? 'Verbo'],
})

const app = rows[0]
if (!app) { console.log('not found'); process.exit(1) }

const { code, ...meta } = app
console.log('=== app ===')
console.log(JSON.stringify(meta, null, 2))

const patterns = [
  'kanthinkData.initial', 'kanthinkData.set(', 'kanthinkData.signedIn',
  'kanthinkData.signIn(', 'kanthinkData.customer', 'localStorage',
  'UNSUPPORTED', 'catch',
]
console.log('\n=== usage ===')
for (const p of patterns) console.log(`${String(code.split(p).length - 1).padStart(3)}  ${p}`)

console.log('\n=== every line mentioning storage or save state ===')
code.split('\n').forEach((l, n) => {
  if (/kanthinkData|saveState|setSaveState|localStorage|Saved|Saving/.test(l)) {
    console.log(String(n + 1).padStart(4) + ' | ' + l.trim().slice(0, 160))
  }
})
process.exit(0)
