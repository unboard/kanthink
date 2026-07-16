/**
 * Send a Kan Work Report email with tasks read from a JSON file
 * (avoids PowerShell inline-JSON quoting issues).
 *
 * Usage: npx tsx scripts/send-work-report-file.ts --to email --tasks-file path.json
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

interface Task {
  name: string
  status: 'Completed' | 'Skipped' | 'Failed'
  details: string
}

function buildHtml(tasks: Task[], date: string): string {
  const completedCount = tasks.filter(t => t.status === 'Completed').length
  const taskRows = tasks.map(t => {
    const statusColor = t.status === 'Completed' ? '#22c55e' : t.status === 'Failed' ? '#ef4444' : '#a1a1aa'
    return `
      <tr>
        <td style="font-size:14px;color:#3f3f46;padding:12px;border-bottom:1px solid #f4f4f5;vertical-align:top;">${t.name}</td>
        <td style="font-size:14px;padding:12px;border-bottom:1px solid #f4f4f5;vertical-align:top;">
          <span style="background:${statusColor};color:#fff;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;">${t.status}</span>
        </td>
        <td style="font-size:14px;color:#3f3f46;padding:12px;border-bottom:1px solid #f4f4f5;vertical-align:top;">${t.details}</td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:24px;margin-bottom:24px;">
    <div style="height:4px;background:#7c3aed;"></div>
    <div style="background:#18181b;padding:20px;text-align:center;">
      <img src="https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_64,h_64/v1769532115/kanthink-icon_pbne7q.svg" width="32" height="32" alt="Kan" style="vertical-align:middle;margin-right:8px;" />
      <span style="color:#fff;font-size:18px;font-weight:700;vertical-align:middle;">Kanthink</span>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 12px;">
        Kan Work Report
      </h1>
      <p style="font-size:15px;color:#3f3f46;line-height:1.6;margin:0 0 24px;">
        Kan completed <strong>${completedCount} task${completedCount !== 1 ? 's' : ''}</strong> and deployed to Vercel. Here's what was done:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="50%" style="padding-right:6px;" valign="top">
            <div style="background:#f4f4f5;border-radius:8px;padding:16px;text-align:center;height:60px;">
              <div style="font-size:28px;font-weight:700;color:#18181b;">${completedCount}</div>
              <div style="font-size:13px;color:#71717a;">Completed</div>
            </div>
          </td>
          <td width="50%" style="padding-left:6px;" valign="top">
            <div style="background:#f4f4f5;border-radius:8px;padding:16px;text-align:center;height:60px;">
              <div style="font-size:14px;color:#3f3f46;line-height:60px;">${date}</div>
            </div>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;padding:8px 12px;border-bottom:2px solid #e4e4e7;">Task</th>
            <th style="text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;padding:8px 12px;border-bottom:2px solid #e4e4e7;">Status</th>
            <th style="text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;padding:8px 12px;border-bottom:2px solid #e4e4e7;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>
      <p style="font-size:15px;color:#3f3f46;line-height:1.6;margin:24px 0 16px;">
        All changes are live. Play the new game at <a href="https://www.kanthink.com/snowpath" style="color:#7c3aed;text-decoration:none;font-weight:600;">kanthink.com/snowpath</a>.
      </p>
      <a href="https://www.kanthink.com/snowpath" style="display:inline-block;background:#7c3aed;border-radius:6px;color:#fff;font-size:14px;font-weight:600;padding:10px 24px;text-decoration:none;">Play Snowpath</a>
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
  const args = process.argv.slice(2)
  const toIdx = args.indexOf('--to')
  const fileIdx = args.indexOf('--tasks-file')
  const to = toIdx >= 0 ? args[toIdx + 1] : 'dhodg22@gmail.com'
  if (fileIdx < 0) {
    console.error('Usage: npx tsx scripts/send-work-report-file.ts --to email --tasks-file path.json')
    process.exit(1)
  }
  const tasks: Task[] = JSON.parse(readFileSync(args[fileIdx + 1], 'utf-8'))
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const html = buildHtml(tasks, date)
  const subject = 'Kan Work Report' // consistent subject so Gmail threads reports

  const cioApi = new APIClient(process.env.CUSTOMERIO_TRANSACTIONAL_API_KEY as string, { region: RegionUS })
  const messageId = process.env.CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID || 'kanthink_email'
  const request = new SendEmailRequest({
    transactional_message_id: messageId,
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
    console.log(`✓ Work Report sent to ${to}`)
  } catch (error) {
    console.error('✗ Failed to send email:', error)
    process.exit(1)
  }
}

main()
