/**
 * Smoke test: send an EPUB file to a Kindle email address via Customer.IO.
 *
 * Usage:
 *   npx tsx scripts/send-kindle-test.ts <kindle-email> <path-to-epub>
 *
 * Prereqs (one-time):
 *   1. ImprovMX (or another forwarder) configured for kanthink.com so that
 *      kan@kanthink.com forwards to a real inbox. Without this, Amazon's
 *      sender verification will reject the message.
 *   2. kan@kanthink.com added to the Kindle approved senders list at
 *      https://www.amazon.com/hz/mycd/myx#/home/settings/payment
 *
 * Env vars (from .env.local):
 *   CUSTOMERIO_TRANSACTIONAL_API_KEY
 *   CUSTOMERIO_SITE_ID
 *   CUSTOMERIO_FROM_EMAIL (defaults to kan@kanthink.com)
 *   CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID (defaults to kanthink_email)
 */
import { readFileSync, statSync } from 'fs'
import { basename } from 'path'
import { sendToKindleEmail } from '../lib/emails/send'

async function main() {
  const [, , kindleEmail, epubPath] = process.argv

  if (!kindleEmail || !epubPath) {
    console.error('Usage: npx tsx scripts/send-kindle-test.ts <kindle-email> <path-to-epub>')
    process.exit(1)
  }

  if (!/@kindle\.com$/i.test(kindleEmail)) {
    console.warn(`[warn] "${kindleEmail}" does not end in @kindle.com — sending anyway`)
  }

  const stat = statSync(epubPath)
  const sizeMb = (stat.size / 1024 / 1024).toFixed(2)
  console.log(`Reading ${epubPath} (${sizeMb} MB)`)

  const data = readFileSync(epubPath)
  const filename = basename(epubPath)

  console.log(`Sending "${filename}" to ${kindleEmail} via CIO...`)
  const result = await sendToKindleEmail({ to: kindleEmail, filename, data })

  if (result.ok) {
    console.log('OK — handed off to Customer.IO. Check Kindle library in 1-5 min.')
    console.log('If nothing arrives: check spam in the forwarding inbox for an Amazon rejection notice.')
  } else {
    console.error('FAILED:', result.reason)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
}).finally(() => process.exit(0))
