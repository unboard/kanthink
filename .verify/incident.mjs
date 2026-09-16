import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT code, requirements, messages, last_usage, updated_at FROM playground_apps WHERE title LIKE ?`,
  args: ['%Launch Simulator%'],
})
const a = rows[0]
console.log('=== button label now ===')
a.code.split('\n').forEach((l, i) => { if (/^\s*(Post|Launch)\s*$/.test(l)) console.log(`  line ${i+1}: ${l.trim()}`) })
console.log('\n=== contract (' + a.requirements.split('\n').filter(Boolean).length + ' lines) ===')
a.requirements.split('\n').filter(Boolean).forEach(l => console.log('  ' + l.slice(0,100)))
console.log('\n=== last build ===')
console.log(' ', a.last_usage)
const msgs = JSON.parse(a.messages || '[]')
console.log('\n=== last 4 thread messages ===')
msgs.slice(-4).forEach((m,i) => console.log(`  [${m.type}] ${String(m.content||'').replace(/\s+/g,' ').slice(0,150)}`))
process.exit(0)
