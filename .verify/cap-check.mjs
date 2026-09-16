import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT title, code FROM playground_apps WHERE title LIKE ? LIMIT 1`, args: ['%Launch Simulator%'],
})
const code = rows[0].code
const checks = {
  'kanthinkAI.generate(': /kanthinkAI\s*\.\s*generate\s*\(/,
  'kanthinkAI.generateImage(': /kanthinkAI\s*\.\s*generateImage\s*\(/,
  'kanthinkUpload(': /kanthinkUpload\s*\(/,
  'kanthinkSave(': /kanthinkSave\s*\(/,
}
console.log(rows[0].title, '—', code.length, 'chars\n')
for (const [k, re] of Object.entries(checks)) {
  console.log(`  ${re.test(code) ? 'PRESENT' : 'MISSING'}  ${k}`)
}
const canned = /CANNED|FALLBACK_COMMENTS|const COMMENTS\s*=|SAMPLE_REPLIES/i.test(code)
console.log(`\n  hardcoded comment pool present: ${canned}`)
process.exit(0)
