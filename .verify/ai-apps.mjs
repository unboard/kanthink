import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT title, generation_count, updated_at FROM playground_apps WHERE code LIKE '%kanthinkAI%' ORDER BY updated_at DESC`, args: [],
})
rows.forEach(r => console.log(`  ${r.title}  (v${r.generation_count})`))
process.exit(0)
