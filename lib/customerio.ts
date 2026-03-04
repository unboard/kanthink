import { TrackClient, RegionUS, APIClient, SendEmailRequest } from 'customerio-node'

const trackingApiKey = process.env.CUSTOMERIO_TRACKING_API_KEY || process.env.CUSTOMERIO_API_KEY

if (!process.env.CUSTOMERIO_SITE_ID || !trackingApiKey) {
  console.warn('Customer.IO credentials not set - email features will be disabled')
}

export const cioTrack = process.env.CUSTOMERIO_SITE_ID && trackingApiKey
  ? new TrackClient(process.env.CUSTOMERIO_SITE_ID, trackingApiKey, { region: RegionUS })
  : null

export const cioApi = process.env.CUSTOMERIO_TRANSACTIONAL_API_KEY
  ? new APIClient(process.env.CUSTOMERIO_TRANSACTIONAL_API_KEY, { region: RegionUS })
  : null

/**
 * Identify a user in Customer.IO. Always sets kanthink_user: true
 * to scope Kanthink contacts in the shared workspace.
 */
export async function identifyUser(user: {
  id: string
  email: string
  name?: string | null
  tier?: string | null
}) {
  if (!cioTrack) return

  try {
    await cioTrack.identify(user.id, {
      email: user.email,
      name: user.name ?? undefined,
      tier: user.tier ?? 'free',
      kanthink_user: true,
    })
  } catch (error) {
    console.error('[CIO] Failed to identify user:', error)
  }
}

/**
 * Send a transactional email through Customer.IO.
 * Uses the single `kanthink_email` transactional template with body override.
 */
export async function sendTransactionalEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  if (!cioApi) {
    console.warn('[CIO] API client not configured, skipping email')
    return false
  }

  const messageId = process.env.CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID || 'kanthink_email'

  try {
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

    await cioApi.sendEmail(request)
    return true
  } catch (error) {
    console.error('[CIO] Failed to send transactional email:', error)
    return false
  }
}
