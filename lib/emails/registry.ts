export interface EmailDefinition {
  slug: string
  name: string
  description: string
  category: 'onboarding' | 'collaboration' | 'billing' | 'usage' | 'digest'
  trigger: {
    description: string
    type: 'event' | 'threshold'
    location: string
  }
  subject: string
  status: 'active' | 'draft'
}

export const emailRegistry: EmailDefinition[] = [
  {
    slug: 'welcome',
    name: 'Welcome',
    description: 'Greets new users after they sign up and introduces them to Kanthink.',
    category: 'onboarding',
    trigger: {
      description: 'Fires when a user completes sign-up',
      type: 'event',
      location: 'lib/emails/send.ts → sendWelcomeEmail',
    },
    subject: 'Welcome to Kanthink!',
    status: 'active',
  },
  {
    slug: 'channel-invite',
    name: 'Channel Invite',
    description: 'Notifies someone they have been invited to collaborate on a channel.',
    category: 'collaboration',
    trigger: {
      description: 'Fires when a user shares a channel with another person',
      type: 'event',
      location: 'lib/emails/send.ts → sendChannelInviteEmail',
    },
    subject: '{{inviterName}} invited you to "{{channelName}}" on Kanthink',
    status: 'active',
  },
  {
    slug: 'task-assigned',
    name: 'Task Assigned',
    description: 'Notifies a user when a task has been assigned to them in a channel.',
    category: 'collaboration',
    trigger: {
      description: 'Fires when a task is assigned to a user',
      type: 'event',
      location: 'lib/emails/send.ts → sendTaskAssignedEmail',
    },
    subject: 'Task assigned: {{taskTitle}}',
    status: 'active',
  },
  {
    slug: 'card-assigned',
    name: 'Card Assigned',
    description: 'Notifies a user when a card has been assigned to them in a channel.',
    category: 'collaboration',
    trigger: {
      description: 'Fires when a card is assigned to a user',
      type: 'event',
      location: 'lib/emails/send.ts → sendCardAssignedEmail',
    },
    subject: 'Card assigned: {{cardTitle}}',
    status: 'active',
  },
  {
    slug: 'payment-failed',
    name: 'Payment Failed',
    description: 'Alerts the user that their payment could not be processed.',
    category: 'billing',
    trigger: {
      description: 'Fires on Stripe charge_failed webhook',
      type: 'event',
      location: 'lib/emails/send.ts → sendPaymentFailedEmail',
    },
    subject: 'Your Kanthink payment could not be processed',
    status: 'active',
  },
  {
    slug: 'subscription-confirmed',
    name: 'Subscription Confirmed',
    description: 'Confirms that a paid subscription is now active.',
    category: 'billing',
    trigger: {
      description: 'Fires when Stripe subscription becomes active',
      type: 'event',
      location: 'lib/emails/send.ts → sendSubscriptionConfirmedEmail',
    },
    subject: 'Your Kanthink subscription is confirmed',
    status: 'active',
  },
  {
    slug: 'subscription-canceled',
    name: 'Subscription Canceled',
    description: 'Notifies the user their subscription has been canceled and when access ends.',
    category: 'billing',
    trigger: {
      description: 'Fires when Stripe subscription is canceled',
      type: 'event',
      location: 'lib/emails/send.ts → sendSubscriptionCanceledEmail',
    },
    subject: 'Your Kanthink subscription has been canceled',
    status: 'active',
  },
  {
    slug: 'usage-limit-warning',
    name: 'Usage Limit Warning',
    description: 'Warns the user they are approaching their AI usage limit for the billing period.',
    category: 'usage',
    trigger: {
      description: 'Fires when usage crosses the warning threshold (e.g. 80%)',
      type: 'threshold',
      location: 'lib/emails/send.ts → sendUsageLimitWarningEmail',
    },
    subject: "You're approaching your Kanthink usage limit",
    status: 'active',
  },
  {
    slug: 'usage-limit-reached',
    name: 'Usage Limit Reached',
    description: 'Informs the user they have exhausted their AI usage limit and need to upgrade or wait.',
    category: 'usage',
    trigger: {
      description: 'Fires when usage reaches 100% of the limit',
      type: 'threshold',
      location: 'lib/emails/send.ts → sendUsageLimitReachedEmail',
    },
    subject: "You've reached your Kanthink usage limit",
    status: 'active',
  },
  {
    slug: 'channel-digest',
    name: 'Channel Digest',
    description: 'Periodic summary of channel activity sent to subscribed users. Includes AI-generated summary and activity list.',
    category: 'digest',
    trigger: {
      description: 'Cron job runs daily at 8 AM UTC; processes daily/weekly/monthly subs',
      type: 'event',
      location: 'lib/emails/send.ts → sendChannelDigestEmail',
    },
    subject: 'Your {{periodLabel}} digest for "{{channelName}}"',
    status: 'active',
  },
]

export function getEmailBySlug(slug: string): EmailDefinition | undefined {
  return emailRegistry.find((e) => e.slug === slug)
}
