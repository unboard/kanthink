/**
 * Send a short "here's the link" email, in the Kanthink shell.
 *
 * The work-report script next door bakes its body in; this one takes the copy
 * as arguments, for the common case of pointing someone at one page.
 *
 * Usage:
 *   npx tsx scripts/send-link-email.ts \
 *     --heading "Heading" --body "One or two sentences." \
 *     --url https://... --cta "Open it" [--to email] [--subject "Kan Work Report"]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { RegionUS, APIClient, SendEmailRequest } from 'customerio-node'

const envPath = resolve(import.meta.dirname || __dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  const key = trimmed.slice(0, eqIdx)
  if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1)
}

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/**
 * Paragraphs are separated by a blank line, or by a literal \n\n — the second
 * form because an argument with a real newline in it doesn't survive the trip
 * through the Windows command line.
 */
function paragraphs(body: string): string {
  return body
    .replace(/\\n/g, '\n')
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#3f3f46;line-height:1.6;margin:0 0 16px;">${p.replace(/\n/g, '<br />')}</p>`
    )
    .join('')
}

function buildHtml(title: string, body: string, url: string, cta: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="height:4px;background:#7c3aed;"></div>
    <div style="background:#18181b;padding:20px;text-align:center;">
      <img src="https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_64,h_64/v1769532115/kanthink-icon_pbne7q.svg" width="32" height="32" alt="Kan" style="vertical-align:middle;margin-right:8px;" />
      <span style="color:#fff;font-size:18px;font-weight:700;vertical-align:middle;">Kanthink</span>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 12px;">${title}</h1>
      ${paragraphs(body)}
      <a href="${url}" style="display:inline-block;background:#7c3aed;border-radius:6px;color:#fff;font-size:14px;font-weight:600;padding:10px 24px;text-decoration:none;">${cta}</a>
      <p style="font-size:13px;color:#71717a;line-height:1.6;margin:16px 0 0;word-break:break-all;">${url}</p>
    </div>
    <div style="background:#fafafa;border-top:1px solid #e4e4e7;padding:16px;text-align:center;">
      <p style="font-size:12px;color:#a1a1aa;margin:0;">AI-driven Kanban for clarity</p>
      <p style="font-size:12px;color:#a1a1aa;margin:4px 0 0;">www.kanthink.com</p>
    </div>
  </div>
</body>
</html>`
}

async function main() {
  const to = arg('to', 'dhodg22@gmail.com')
  // Not --title: node claims that one for the process title, so it never
  // reaches this script.
  const title = arg('heading')
  const body = arg('body')
  const url = arg('url')
  const cta = arg('cta', 'Open it')
  // Same subject as the work reports, so Gmail keeps them in one thread.
  const subject = arg('subject', 'Kan Work Report')

  if (!title || !url) {
    console.error('Usage: npx tsx scripts/send-link-email.ts --heading "..." --body "..." --url https://... [--cta "..."] [--to email]')
    process.exit(1)
  }

  const html = buildHtml(title, body, url, cta)
  const cioApi = new APIClient(process.env.CUSTOMERIO_TRANSACTIONAL_API_KEY as string, { region: RegionUS })
  const request = new SendEmailRequest({
    transactional_message_id: process.env.CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID || 'kanthink_email',
    to,
    from: process.env.CUSTOMERIO_FROM_EMAIL || 'kan@kanthink.com',
    subject,
    body: html,
    identifiers: { email: to },
    message_data: { subject, body: html },
    disable_message_retention: false,
  })

  try {
    await cioApi.sendEmail(request)
    console.log(`✓ Sent to ${to}`)
  } catch (error) {
    console.error('✗ Failed to send email:', error)
    process.exit(1)
  }
}

main()
