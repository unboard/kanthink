import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT title, code FROM playground_apps WHERE title LIKE ?`, args: ['%Launch Simulator%'],
})
const code = rows[0].code
const lines = code.split('\n')
// Every line around an AI call, plus any fallback nearby.
lines.forEach((l, i) => {
  if (/kanthinkAI|catch|fallback|FALLBACK|generateFallback|simulate|Math\.random\(\)/.test(l)) {
    console.log(String(i + 1).padStart(4) + ' | ' + l.replace(/\s+$/,'').slice(0, 150))
  }
})
process.exit(0)
