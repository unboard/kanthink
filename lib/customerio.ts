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
 *
 * Optional `attachments` are passed through CIO's SendEmailRequest.attach().
 * CIO caps individual attachments at 2MB.
 */
export async function sendTransactionalEmail({
  to,
  subject,
  html,
  attachments,
  replyTo,
}: {
  to: string
  subject: string
  html: string
  attachments?: Array<{ filename: string; data: Buffer }>
  /** Where a reply goes, when it shouldn't be Kan's sending address. */
  replyTo?: string | null
}): Promise<boolean> {
  if (!cioApi) {
    console.warn('[CIO] API client not configured, skipping email')
    return false
  }

  const messageId = process.env.CUSTOMERIO_TRANSACTIONAL_MESSAGE_ID || 'kanthink_email'

  try {
    const request = new SendEmailRequest({
      ...(replyTo ? { reply_to: replyTo } : {}),
      transactional_message_id: messageId,
      to,
      from: process.env.CUSTOMERIO_FROM_EMAIL || 'kan@kanthink.com',
      subject,
      body: html,
      identifiers: { email: to },
      message_data: { subject, body: html },
      disable_message_retention: false,
    })

    if (attachments) {
      for (const a of attachments) {
        request.attach(a.filename, a.data)
      }
    }

    await cioApi.sendEmail(request)
    return true
  } catch (error) {
    console.error('[CIO] Failed to send transactional email:', error)
    return false
  }
}

/**
 * Send one transactional email and hand back Customer.IO's delivery id.
 *
 * The same send as sendTransactionalEmail, except it keeps the id the API returns.
 * People emails need it: Customer.IO's reporting webhook reports delivered, opened
 * and clicked against that id, and it's the only thing that ties an event back to
 * the email in someone's thread.
 */
export async function sendTrackedEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string
  subject: string
  html: string
  /** Where their reply goes: the person who made the app, not Kan's sending address. */
  replyTo?: string | null
}): Promise<{ ok: boolean; deliveryId: string | null; error?: string }> {
  if (!cioApi) return { ok: false, deliveryId: null, error: 'Email is not configured' }
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
      ...(replyTo ? { reply_to: replyTo } : {}),
    })
    const response = (await cioApi.sendEmail(request)) as { delivery_id?: string } | undefined
    return { ok: true, deliveryId: response?.delivery_id ?? null }
  } catch (error) {
    console.error('[CIO] Failed to send tracked email:', error)
    return { ok: false, deliveryId: null, error: error instanceof Error ? error.message : 'Send failed' }
  }
}
