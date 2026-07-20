import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

const env = loadEnv()
const key = env.OWNER_GOOGLE_API_KEY ?? env.GOOGLE_API_KEY
if (!key) { console.error('NO_KEY — env keys:', Object.keys(env).filter(k => /GOOGLE|GEMINI/i.test(k))); process.exit(1) }

;(async () => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`)
  const j: any = await r.json()
  const models = j.models || []
  console.log('Total:', models.length)
  console.log('\n=== Models matching image/imagen/banana ===')
  for (const m of models) {
    const name = m.name || ''
    const disp = m.displayName || ''
    if (/image|imagen|banana/i.test(name + ' ' + disp)) {
      console.log(name, '|', disp, '|', (m.supportedGenerationMethods || []).join(','))
    }
  }
  console.log('\n=== All gemini-2.5 / gemini-3 models ===')
  for (const m of models) {
    const name = m.name || ''
    if (/gemini-2\.5|gemini-3/.test(name)) {
      console.log(name, '|', m.displayName || '', '|', (m.supportedGenerationMethods || []).join(','))
    }
  }
})()
