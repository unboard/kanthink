import { render } from '@react-email/render'
import { sendTransactionalEmail } from '@/lib/customerio'
import { ChannelInvite } from './ChannelInvite'
import { Welcome } from './Welcome'
import { TaskAssigned } from './TaskAssigned'
import { CardAssigned } from './CardAssigned'
import { PaymentFailed } from './PaymentFailed'
import { SubscriptionConfirmed } from './SubscriptionConfirmed'
import { SubscriptionCanceled } from './SubscriptionCanceled'
import { UsageLimitWarning } from './UsageLimitWarning'
import { UsageLimitReached } from './UsageLimitReached'
import { DynamicEmail, type EmailConfig } from './dynamicRenderer'
import { db } from '@/lib/db'
import { emailTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import React from 'react'

async function renderAndSend(to: string, subject: string, component: React.ReactElement): Promise<boolean> {
  try {
    const html = await render(component)
    return sendTransactionalEmail({ to, subject, html })
  } catch (error) {
    console.error('[Email] Failed to render/send:', error)
    return false
  }
}

export async function sendChannelInviteEmail(
  to: string,
  props: { inviterName: string; channelName: string; signUpUrl: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    `${props.inviterName} invited you to "${props.channelName}" on Kanthink`,
    React.createElement(ChannelInvite, props)
  )
}

export async function sendWelcomeEmail(
  to: string,
  props: { userName: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    'Welcome to Kanthink!',
    React.createElement(Welcome, props)
  )
}

export async function sendTaskAssignedEmail(
  to: string,
  props: { assignerName: string; taskTitle: string; channelName: string; taskUrl: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    `Task assigned: ${props.taskTitle}`,
    React.createElement(TaskAssigned, props)
  )
}

export async function sendCardAssignedEmail(
  to: string,
  props: { assignerName: string; cardTitle: string; channelName: string; cardUrl: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    `Card assigned: ${props.cardTitle}`,
    React.createElement(CardAssigned, props)
  )
}

export async function sendPaymentFailedEmail(
  to: string,
  props: { userName: string; settingsUrl: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    'Your Kanthink payment could not be processed',
    React.createElement(PaymentFailed, props)
  )
}

export async function sendSubscriptionConfirmedEmail(
  to: string,
  props: { userName: string; tier: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    'Your Kanthink subscription is confirmed',
    React.createElement(SubscriptionConfirmed, props)
  )
}

export async function sendSubscriptionCanceledEmail(
  to: string,
  props: { userName: string; endDate: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    'Your Kanthink subscription has been canceled',
    React.createElement(SubscriptionCanceled, props)
  )
}

export async function sendUsageLimitWarningEmail(
  to: string,
  props: { userName: string; used: number; limit: number; tier: string; upgradeUrl: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    "You're approaching your Kanthink usage limit",
    React.createElement(UsageLimitWarning, props)
  )
}

export async function sendUsageLimitReachedEmail(
  to: string,
  props: { userName: string; limit: number; tier: string; upgradeUrl: string; resetDate: string }
): Promise<boolean> {
  return renderAndSend(
    to,
    'You\'ve reached your Kanthink usage limit',
    React.createElement(UsageLimitReached, props)
  )
}

/**
 * Send an email using a saved dynamic template (looked up by slug).
 * Supports {{placeholder}} substitution in subject and body JSON.
 */
export async function sendDynamicEmail({
  slug,
  to,
  variables,
}: {
  slug: string
  to: string
  variables?: Record<string, string>
}): Promise<boolean> {
  await ensureSchema()

  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.slug, slug))
    .limit(1)

  if (!template || !template.body) {
    console.error(`[Email] Template not found: ${slug}`)
    return false
  }

  let subject = template.subject
  let bodyJson = JSON.stringify(template.body)

  // Substitute {{placeholder}} variables
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      subject = subject.replace(pattern, value)
      bodyJson = bodyJson.replace(pattern, value)
    }
  }

  const config: EmailConfig = {
    subject,
    previewText: template.previewText || subject,
    body: JSON.parse(bodyJson),
  }

  return renderAndSend(
    to,
    subject,
    React.createElement(DynamicEmail, { config })
  )
}
