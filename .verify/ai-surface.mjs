/**
 * Across every app: what do they send to /api/playground/ai, and would it be refused?
 *
 * The apps swallow failures, so a refusal shows up as canned content rather than an
 * error. This looks at what they actually ask for and checks it against the rules the
 * endpoint now enforces.
 */
import fs from 'fs'
import { createClient } from '@libsql/client'

const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })

const { PRICED_MODELS } = await import('../lib/playground/aiPricing.ts').catch(() => ({ PRICED_MODELS: null }))

const { rows } = await client.execute({
  sql: `SELECT id, title, code FROM playground_apps
        WHERE code IS NOT NULL AND code LIKE '%kanthinkAI%' ORDER BY updated_at DESC`,
  args: [],
})

console.log(`${rows.length} apps call kanthinkAI\n`)

const modelUse = new Map()
let withDataUrl = 0
let withLongSystem = 0
let withSilentFallback = 0

for (const app of rows) {
  const code = app.code
  // Hardcoded model names passed to the helper.
  const models = [...code.matchAll(/model\s*:\s*['"]([\w.\-]+)['"]/g)].map((m) => m[1])
  for (const m of models) {
    if (!modelUse.has(m)) modelUse.set(m, [])
    modelUse.get(m).push(app.title)
  }
  // A generated data: URL handed straight back in as imageUrl.
  if (/imageUrl\s*:\s*[^,\n]*(dataUrl|finalImage|generatedImage)/.test(code)) withDataUrl++
  // A catch that quietly substitutes content.
  if (/catch[\s\S]{0,200}(fallback|Fallback|FALLBACK|canned|CANNED)/.test(code)) withSilentFallback++
}

console.log('=== models these apps hardcode ===')
const priced = PRICED_MODELS ? Object.keys(PRICED_MODELS) : []
for (const [model, apps] of [...modelUse.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const ok = priced.length === 0 ? '?' : (priced.includes(model) ? 'PRICED' : '*** UNPRICED — REFUSED ***')
  console.log(`  ${String(apps.length).padStart(3)}x  ${model.padEnd(34)} ${ok}`)
  if (priced.length && !priced.includes(model)) {
    console.log(`         used by: ${[...new Set(apps)].slice(0, 6).join(', ')}`)
  }
}

console.log(`\n=== other risks ===`)
console.log(`  apps feeding a generated data: URL back in as imageUrl: ${withDataUrl}`)
console.log(`  apps with a catch that silently substitutes content:    ${withSilentFallback}`)
console.log(`\n=== priced model ids (${priced.length}) ===`)
console.log('  ' + priced.join('\n  '))
process.exit(0)
