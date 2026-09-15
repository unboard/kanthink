import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { rows } = await client.execute({
  sql: `SELECT code FROM playground_apps WHERE title = ? ORDER BY created_at DESC LIMIT 1`,
  args: [process.argv[2] ?? 'Verbo'],
})
fs.writeFileSync('.verify/app.jsx', rows[0].code)
console.log('wrote .verify/app.jsx', rows[0].code.length, 'chars')
process.exit(0)
