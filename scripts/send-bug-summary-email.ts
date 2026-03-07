import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load env from .env.local ────────────────────────────────────────
function loadEnv() {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    env[t.slice(0, eq)] = t.slice(eq + 1)
  }
  return env
}

const env = loadEnv()

// Set env vars so customerio.ts can read them
for (const [k, v] of Object.entries(env)) {
  process.env[k] = v
}

const TO = 'dhodg22@gmail.com'

async function main() {
  const { sendTransactionalEmail, identifyUser } = await import('../lib/customerio.js')

  const args = process.argv.slice(2)

  if (args[0] === '--identify') {
    await identifyUser({ id: 'claude-bot-notify', email: TO, name: 'Dustin (Bug Bot)' })
    console.log(`Identified ${TO} in Customer.IO`)
    return
  }

  const summary = args.join(' ') || 'No summary provided.'
  const firstLine = summary.indexOf('\n') > 0 ? summary.slice(0, summary.indexOf('\n')) : summary
  const subjectSnippet = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <div style="background: #7c3aed; height: 4px; border-radius: 4px 4px 0 0;"></div>
  <div style="background: #18181b; padding: 16px 20px; border-radius: 0;">
    <span style="color: white; font-size: 14px; font-weight: 600;">Kan Bug Bot</span>
  </div>
  <div style="background: white; padding: 24px 20px; border: 1px solid #e4e4e7; border-top: none;">
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #18181b;">Bug Run Summary</h2>
    <div style="font-size: 14px; line-height: 1.6; color: #3f3f46; white-space: pre-line;">${summary}</div>
  </div>
  <div style="background: #fafafa; padding: 12px 20px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 4px 4px;">
    <span style="font-size: 11px; color: #a1a1aa;">Sent by Claude Code via Customer.IO</span>
  </div>
</div>
`

  const sent = await sendTransactionalEmail({
    to: TO,
    subject: `Kan Bug Bot: ${subjectSnippet}`,
    html,
  })

  if (sent) {
    console.log(`Summary email sent to ${TO}`)
  } else {
    console.error('Failed to send summary email')
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
