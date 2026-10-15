import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY not set - email features will be disabled')
}

export const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/** Who Kan's email comes from. The domain must be verified in Resend. */
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Kan <kan@kanthink.com>'

/** Resend renamed audiences to segments; either env name works. */
const segmentId = process.env.RESEND_AUDIENCE_ID || process.env.RESEND_SEGMENT_ID

/**
 * Add a user to the Kanthink audience in Resend, so broadcasts can reach them.
 * Does nothing unless RESEND_AUDIENCE_ID is set. Safe to call on every sign-in:
 * a contact that already exists is just (re)added to the audience.
 */
export async function identifyUser(user: {
  id: string
  email: string
  name?: string | null
  tier?: string | null
}) {
  if (!resend || !segmentId) return

  const [firstName, ...rest] = (user.name ?? '').trim().split(/\s+/)
  try {
    const { error } = await resend.contacts.create({
      email: user.email,
      firstName: firstName || undefined,
      lastName: rest.join(' ') || undefined,
      segments: [{ id: segmentId }],
    })
    if (!error) return
    const added = await resend.contacts.segments.add({ email: user.email, segmentId })
    if (added.error) console.error('[Resend] Failed to add contact to audience:', added.error)
  } catch (error) {
    console.error('[Resend] Failed to identify user:', error)
  }
}

interface EmailInput {
  to: string
  subject: string
  html: string
  /** Where a reply goes, when it shouldn't be Kan's sending address. */
  replyTo?: string | null
  /** Resend caps a whole email, attachments included, at 40MB. */
  attachments?: Array<{ filename: string; data: Buffer }>
}

/**
 * Send one email and hand back Resend's email id.
 *
 * People emails keep the id: Resend's webhook reports delivered, opened and clicked
 * against it, and it's the only thing that ties an event back to the email in
 * someone's thread.
 */
export async function sendTrackedEmail({ to, subject, html, replyTo, attachments }: EmailInput): Promise<{
  ok: boolean
  deliveryId: string | null
  error?: string
}> {
  if (!resend) return { ok: false, deliveryId: null, error: 'Email is not configured' }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.data })) }
        : {}),
    })
    if (error) {
      console.error('[Resend] Failed to send email:', error)
      return { ok: false, deliveryId: null, error: error.message }
    }
    return { ok: true, deliveryId: data?.id ?? null }
  } catch (error) {
    console.error('[Resend] Failed to send email:', error)
    return { ok: false, deliveryId: null, error: error instanceof Error ? error.message : 'Send failed' }
  }
}

/** Send one transactional email. True when Resend accepted it. */
export async function sendTransactionalEmail(input: EmailInput): Promise<boolean> {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY not set, skipping email')
    return false
  }
  return (await sendTrackedEmail(input)).ok
}
