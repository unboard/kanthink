/**
 * Send MCS customer outreach emails via Customer.IO.
 *
 * Usage:
 *   npx tsx scripts/send-mcs-outreach-email.ts --to <email> --email <1|2>
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { RegionUS, APIClient, SendEmailRequest } from 'customerio-node'

// Load .env.local manually
const envPath = resolve(import.meta.dirname || __dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

function buildEmail1Html(): { subject: string; html: string } {
  const subject = "Your Easter A-Frame sign looks incredible, Dustin"
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;margin-top:32px;margin-bottom:32px;border:1px solid #e7e5e4;">

    <!-- Hero image -->
    <div style="text-align:center;padding:32px 24px 0;">
      <img src="https://res.cloudinary.com/dcht3dytz/image/upload/w_460,q_auto,f_auto/v1774018985/kanthink/cards/JZ1Vg-yUQMVhFl7Z9wpam/eadfsw6mrsii4yym8xco.png"
           width="460"
           alt="Grace Church He Is Risen A-Frame Sign"
           style="max-width:100%;height:auto;border-radius:4px;" />
    </div>

    <!-- Body -->
    <div style="padding:32px 32px 40px;">
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Hi Dustin,
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        I saw your <strong>"He Is Risen"</strong> A-Frame sign design for Grace Church and had to reach out &mdash; it's genuinely beautiful. The soft floral watercolors framing that bold headline create such an inviting contrast, and the crown of thorns detail in the center is a really thoughtful touch. It feels warm and celebratory without being overly busy.
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        With Easter just around the corner, this design would look stunning printed on one of our <strong>Signicade A-Frame signs</strong>. They're durable, weather-resistant, and designed for high-visibility outdoor placement &mdash; perfect for the sidewalk outside the church or along the road to catch the eye of passersby.
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        A few things that make our A-Frames a great fit for this:
      </p>
      <table style="width:100%;margin:0 0 24px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;" width="28">&bull;</td>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;">Printed on rigid coroplast inserts that slide right in &mdash; swap designs for different seasons</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;" width="28">&bull;</td>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;">Full-color printing captures every detail of your floral artwork</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;" width="28">&bull;</td>
          <td style="padding:8px 0;font-size:16px;color:#44403c;line-height:1.6;">Folds flat for easy storage between services</td>
        </tr>
      </table>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 28px;">
        Your design is already print-ready. If you'd like to get this printed and in front of your congregation before Easter Sunday, I can help you get started.
      </p>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="https://www.mycreativeshop.com/products/a-frame-signs"
           style="display:inline-block;background:#2d5016;border-radius:6px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 32px;text-decoration:none;">
          View A-Frame Sign Options
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;text-align:center;">
      <p style="font-size:13px;color:#a8a29e;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">MyCreativeShop &mdash; Design. Print. Done.</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

function buildEmail2Html(): { subject: string; html: string } {
  const subject = "Quick thought on your Grace Church sign"
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;margin-top:32px;margin-bottom:32px;border:1px solid #e7e5e4;">

    <!-- Body -->
    <div style="padding:40px 32px;">
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Hi Dustin,
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Following up on your Easter A-Frame design &mdash; I wanted to share something I noticed. That floral border you created has a really versatile feel to it. A lot of churches we work with get one A-Frame printed for Easter and then realize they want another version for their regular Sunday services, VBS announcements, or fall harvest events.
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Since your design already nails the visual identity for Grace Church, it would be easy to adapt it into a set of seasonal inserts. One frame, multiple messages throughout the year. It's the most cost-effective way to keep the signage fresh.
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Here's what I'd suggest to get the most out of your design:
      </p>
      <table style="width:100%;margin:0 0 24px;background:#fafaf9;border-radius:6px;padding:4px 0;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;font-weight:600;" width="80">Now</td>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;">Print your Easter "He Is Risen" A-Frame &mdash; it's ready to go</td>
        </tr>
        <tr>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;font-weight:600;border-top:1px solid #e7e5e4;" width="80">Next</td>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;border-top:1px solid #e7e5e4;">Duplicate the template &amp; swap the headline for your regular service hours</td>
        </tr>
        <tr>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;vertical-align:top;font-weight:600;border-top:1px solid #e7e5e4;" width="80">Later</td>
          <td style="padding:12px 20px;font-size:16px;color:#44403c;line-height:1.6;border-top:1px solid #e7e5e4;">Create seasonal versions (VBS, fall, Christmas) &mdash; same frame, fresh message</td>
        </tr>
      </table>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 28px;">
        Easter is ${getDaysUntilEaster()} days away. If you order soon, we can have it at your door in time. No minimums, no setup fees.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://www.mycreativeshop.com/products/a-frame-signs"
           style="display:inline-block;background:#2d5016;border-radius:6px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 32px;text-decoration:none;">
          Print Your A-Frame Sign
        </a>
      </div>
      <div style="text-align:center;">
        <p style="font-size:14px;color:#a8a29e;margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Questions? Just reply to this email.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;text-align:center;">
      <p style="font-size:13px;color:#a8a29e;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">MyCreativeShop &mdash; Design. Print. Done.</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

function buildEddmEmail1Html(): { subject: string; html: string } {
  const daysLeft = getDaysUntilEaster()
  const subject = "Fill every seat this Easter — here's how"
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;margin-top:32px;margin-bottom:32px;border:1px solid #e7e5e4;">
    <div style="padding:40px 32px;">
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Dustin,
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Your A-Frame gets people who walk by. An <strong>EDDM postcard</strong> gets everyone else.
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Every Door Direct Mail lets you send a full-color postcard to <em>every household</em> around Grace Church &mdash; no mailing list needed. You pick the zip codes and carrier routes, USPS handles the rest. Churches are one of the top EDDM use cases because the goal is simple: invite the neighborhood.
      </p>

      <!-- Quick stats -->
      <table style="width:100%;margin:0 0 24px;border-collapse:collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#f5f0eb;border-radius:6px 0 0 6px;padding:20px;text-align:center;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1c1917;">9&times;6.5&Prime;</div>
            <div style="font-size:12px;color:#78716c;margin-top:4px;font-family:-apple-system,sans-serif;">USPS-approved size</div>
          </td>
          <td style="width:2px;"></td>
          <td style="background:#f5f0eb;padding:20px;text-align:center;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1c1917;">$0.22</div>
            <div style="font-size:12px;color:#78716c;margin-top:4px;font-family:-apple-system,sans-serif;">USPS postage/piece</div>
          </td>
          <td style="width:2px;"></td>
          <td style="background:#f5f0eb;border-radius:0 6px 6px 0;padding:20px;text-align:center;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1c1917;">${daysLeft}d</div>
            <div style="font-size:12px;color:#78716c;margin-top:4px;font-family:-apple-system,sans-serif;">until Easter</div>
          </td>
        </tr>
      </table>

      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 24px;">
        You already have the design eye &mdash; that floral Easter artwork would look incredible as a large-format postcard landing in every mailbox within a few miles of the church.
      </p>

      <div style="text-align:center;">
        <a href="https://www.mycreativeshop.com/postcards/eddm"
           style="display:inline-block;background:#2d5016;border-radius:6px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 32px;text-decoration:none;">
          Explore EDDM Postcards
        </a>
      </div>
    </div>
    <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;text-align:center;">
      <p style="font-size:13px;color:#a8a29e;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">MyCreativeShop &mdash; Design. Print. Done.</p>
    </div>
  </div>
</body>
</html>`
  return { subject, html }
}

function buildEddmEmail2Html(): { subject: string; html: string } {
  const subject = "The 3-step Easter mailer plan"
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;margin-top:32px;margin-bottom:32px;border:1px solid #e7e5e4;">
    <div style="padding:40px 32px;">
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Dustin,
      </p>
      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 20px;">
        Wanted to make this as easy as possible. Here's the whole EDDM playbook for Grace Church's Easter campaign:
      </p>

      <!-- 3 steps -->
      <table style="width:100%;margin:0 0 24px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #f0ede8;vertical-align:top;" width="48">
            <div style="width:32px;height:32px;border-radius:50%;background:#2d5016;color:#fff;font-weight:700;font-size:15px;line-height:32px;text-align:center;font-family:-apple-system,sans-serif;">1</div>
          </td>
          <td style="padding:16px 0 16px 8px;border-bottom:1px solid #f0ede8;">
            <strong style="font-size:16px;color:#1c1917;">Pick your routes</strong>
            <div style="font-size:15px;color:#57534e;margin-top:4px;line-height:1.5;">Use the USPS EDDM tool to select carrier routes around Grace Church. Most churches target a 3-5 mile radius.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #f0ede8;vertical-align:top;" width="48">
            <div style="width:32px;height:32px;border-radius:50%;background:#2d5016;color:#fff;font-weight:700;font-size:15px;line-height:32px;text-align:center;font-family:-apple-system,sans-serif;">2</div>
          </td>
          <td style="padding:16px 0 16px 8px;border-bottom:1px solid #f0ede8;">
            <strong style="font-size:16px;color:#1c1917;">Design your postcard</strong>
            <div style="font-size:15px;color:#57534e;margin-top:4px;line-height:1.5;">Adapt your "He Is Risen" artwork to a 9&times;6.5&Prime; EDDM postcard. Front: your design. Back: service times, church address, and a warm invitation.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;vertical-align:top;" width="48">
            <div style="width:32px;height:32px;border-radius:50%;background:#2d5016;color:#fff;font-weight:700;font-size:15px;line-height:32px;text-align:center;font-family:-apple-system,sans-serif;">3</div>
          </td>
          <td style="padding:16px 0 16px 8px;">
            <strong style="font-size:16px;color:#1c1917;">We print &amp; prep, you drop at USPS</strong>
            <div style="font-size:15px;color:#57534e;margin-top:4px;line-height:1.5;">We print on premium 14pt cardstock with high-gloss UV finish, bundled and labeled by route. You drop them off at your local post office. Done.</div>
          </td>
        </tr>
      </table>

      <p style="font-size:17px;color:#1c1917;line-height:1.7;margin:0 0 24px;">
        The best part? No mailing list to buy, no permits to figure out. EDDM is the simplest way to reach every home near the church. Most orders ship in 3-5 business days.
      </p>

      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://www.mycreativeshop.com/postcards/eddm"
           style="display:inline-block;background:#2d5016;border-radius:6px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 32px;text-decoration:none;">
          Start Your EDDM Campaign
        </a>
      </div>
      <div style="text-align:center;">
        <p style="font-size:14px;color:#a8a29e;margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Reply to this email if you want help picking routes or sizing &mdash; happy to walk you through it.
        </p>
      </div>
    </div>
    <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:20px 32px;text-align:center;">
      <p style="font-size:13px;color:#a8a29e;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">MyCreativeShop &mdash; Design. Print. Done.</p>
    </div>
  </div>
</body>
</html>`
  return { subject, html }
}

function getDaysUntilEaster(): number {
  // Easter 2026 is April 5
  const easter = new Date(2026, 3, 5)
  const now = new Date()
  const diff = Math.ceil((easter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(diff, 0)
}

async function main() {
  const args = process.argv.slice(2)
  const toIdx = args.indexOf('--to')
  const emailIdx = args.indexOf('--email')

  const to = toIdx >= 0 ? args[toIdx + 1] : 'dhodg22@gmail.com'
  const emailNum = emailIdx >= 0 ? args[emailIdx + 1] : '1'

  let email: { subject: string; html: string }
  switch (emailNum) {
    case '2': email = buildEmail2Html(); break
    case '3': email = buildEddmEmail1Html(); break
    case '4': email = buildEddmEmail2Html(); break
    default: email = buildEmail1Html(); break
  }
  const { subject, html } = email

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
    console.log(`✓ Email ${emailNum} sent to ${to}: "${subject}"`)
  } catch (error) {
    console.error('✗ Failed to send email:', error)
    process.exit(1)
  }
}

main()
