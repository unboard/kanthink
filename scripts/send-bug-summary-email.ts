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
for (const [k, v] of Object.entries(env)) {
  process.env[k] = v
}

const TO = 'dhodg22@gmail.com'

// ── Parse CLI args ──────────────────────────────────────────────────
// Usage:
//   --identify                         Ensure user exists in CIO
//   --no-work                          Send "no cards in queue" email
//   --completed <json>                 Send summary of completed cards
//     json format: [{"title":"...", "summary":"..."}]

interface CompletedCard {
  title: string
  summary: string
}

function buildEmailConfig(cards: CompletedCard[]) {
  const completedCount = cards.length
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  const taskRows = cards.map((card, i) => ({
    type: 'tr',
    props: { style: { backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' } },
    children: [
      {
        type: 'td',
        props: { style: { fontSize: '13px', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
        children: card.title,
      },
      {
        type: 'td',
        props: { style: { fontSize: '13px' } },
        children: {
          type: 'span',
          props: { style: { backgroundColor: '#22c55e', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '12px', display: 'inline-block' } },
          children: 'Completed',
        },
      },
      {
        type: 'td',
        props: { style: { fontSize: '13px', maxWidth: '200px' } },
        children: card.summary,
      },
    ],
  }))

  return {
    subject: `Bug Bot: ${completedCount} task${completedCount === 1 ? '' : 's'} completed`,
    previewText: `Kan completed ${completedCount} task${completedCount === 1 ? '' : 's'} and deployed to Vercel`,
    body: [
      { type: 'Heading', children: 'Kan Bug Bot Report' },
      {
        type: 'Text',
        children: [
          'Kan completed ',
          { type: 'strong', children: `${completedCount} task${completedCount === 1 ? '' : 's'}` },
          ` and deployed to Vercel. Here's what was done:`,
        ],
      },
      {
        type: 'table',
        props: { cellPadding: '0', cellSpacing: '0', style: { width: '100%', margin: '0 0 16px' } },
        children: {
          type: 'tr',
          children: [
            {
              type: 'td',
              props: { style: { backgroundColor: '#fafafa', borderRadius: '8px', padding: '16px', textAlign: 'center', width: '50%', borderBottom: 'none' } },
              children: [
                { type: 'Text', props: { style: { fontSize: '24px', fontWeight: 700, color: '#18181b', margin: '0' } }, children: String(completedCount) },
                { type: 'Text', props: { style: { fontSize: '12px', color: '#71717a', margin: '4px 0 0' } }, children: 'Completed' },
              ],
            },
            { type: 'td', props: { style: { width: '8px', borderBottom: 'none' } } },
            {
              type: 'td',
              props: { style: { backgroundColor: '#fafafa', borderRadius: '8px', padding: '16px', textAlign: 'center', width: '50%', borderBottom: 'none' } },
              children: [
                { type: 'Text', props: { style: { fontSize: '12px', color: '#71717a', margin: '0' } }, children: dateStr },
              ],
            },
          ],
        },
      },
      {
        type: 'table',
        props: { cellPadding: '0', cellSpacing: '0', style: { width: '100%', borderCollapse: 'collapse', margin: '0 0 16px' } },
        children: [
          {
            type: 'thead',
            children: {
              type: 'tr',
              children: [
                { type: 'th', props: { style: { fontSize: '13px' } }, children: 'Task' },
                { type: 'th', props: { style: { fontSize: '13px' } }, children: 'Status' },
                { type: 'th', props: { style: { fontSize: '13px' } }, children: 'Details' },
              ],
            },
          },
          { type: 'tbody', children: taskRows },
        ],
      },
      { type: 'Text', children: 'All changes are live on Vercel. Check the cards in Kanthink for full details.' },
      {
        type: 'Section',
        props: { style: { textAlign: 'left', margin: '16px 0' } },
        children: { type: 'Button', props: { href: 'https://kanthink.com' }, children: 'View Your Boards' },
      },
    ],
  }
}

function buildNoWorkConfig() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  return {
    subject: 'Bug Bot: No tasks in queue',
    previewText: `Checked at ${dateStr} — no cards to work on`,
    body: [
      { type: 'Heading', children: 'Kan Bug Bot Report' },
      {
        type: 'Text',
        children: `No cards in the "Do these" column. Checked at ${dateStr}.`,
      },
      { type: 'Text', children: "I'll check again in an hour. Add cards to the channel and I'll pick them up on my next run." },
      {
        type: 'Section',
        props: { style: { textAlign: 'left', margin: '16px 0' } },
        children: { type: 'Button', props: { href: 'https://kanthink.com' }, children: 'View Your Boards' },
      },
    ],
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--identify') {
    const { identifyUser } = await import('../lib/customerio.js')
    await identifyUser({ id: 'claude-bot-notify', email: TO, name: 'Dustin (Bug Bot)' })
    console.log(`Identified ${TO} in Customer.IO`)
    return
  }

  // Build email config
  let emailConfig: { subject: string; previewText: string; body: unknown[] }

  if (args[0] === '--no-work') {
    emailConfig = buildNoWorkConfig()
  } else if (args[0] === '--completed') {
    const json = args.slice(1).join(' ')
    const cards: CompletedCard[] = JSON.parse(json)
    emailConfig = buildEmailConfig(cards)
  } else {
    console.log('Usage:')
    console.log('  npx tsx scripts/send-bug-summary-email.ts --identify')
    console.log('  npx tsx scripts/send-bug-summary-email.ts --no-work')
    console.log('  npx tsx scripts/send-bug-summary-email.ts --completed \'[{"title":"...","summary":"..."}]\'')
    process.exit(1)
  }

  // Render via DynamicEmail + react-email
  const React = await import('react')
  const { render } = await import('@react-email/render')
  const { DynamicEmail } = await import('../lib/emails/dynamicRenderer.js')

  const html = await render(
    React.createElement(DynamicEmail, { config: emailConfig as any })
  )

  // Send via CIO
  const { sendTransactionalEmail } = await import('../lib/customerio.js')
  const sent = await sendTransactionalEmail({
    to: TO,
    subject: emailConfig.subject,
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
