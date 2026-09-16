import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({
  sql: `SELECT id, title, code, generation_count, published_version_id, is_public,
               LENGTH(code) AS len, requirements, last_notes
        FROM playground_apps WHERE title LIKE ? LIMIT 1`, args: ['%Launch Simulator%'],
})
const a = rows[0]
const caps = {
  'AI text': /kanthinkAI\s*\.\s*generate\s*\(/,
  'AI image': /kanthinkAI\s*\.\s*generateImage\s*\(/,
  'upload': /kanthinkUpload\s*\(/,
  'share link': /kanthinkSave\s*\(/,
}
const { rows: vers } = await client.execute({
  sql: `SELECT COUNT(*) AS n FROM playground_app_versions WHERE app_id = ?`, args: [a.id],
})
console.log(JSON.stringify({
  appId: a.id,
  builds: a.generation_count,
  draftCodeLen: a.len,
  publishedVersionId: a.published_version_id,
  releaseCount: Number(vers[0].n),
  isPublic: a.is_public,
  capabilitiesInDraft: Object.fromEntries(Object.entries(caps).map(([k, re]) => [k, re.test(a.code)])),
  hasContract: !!a.requirements,
  contractLines: (a.requirements ?? '').split('\n').filter(Boolean).length,
  lastNotes: a.last_notes,
}, null, 2))
fs.writeFileSync('.verify/draft-before.jsx', a.code)
process.exit(0)
