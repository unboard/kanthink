export interface EmailVariable {
  name: string
  description: string
  example: string
}

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
  variables: EmailVariable[]
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
    ],
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
    variables: [
      { name: 'inviterName', description: 'Name of the person who sent the invite', example: 'Jordan' },
      { name: 'channelName', description: 'Name of the channel being shared', example: 'Product Roadmap' },
      { name: 'signUpUrl', description: 'URL to accept the invite', example: 'https://kanthink.com/invite/abc123' },
    ],
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
    variables: [
      { name: 'assignerName', description: 'Name of the person who assigned the task', example: 'Jordan' },
      { name: 'taskTitle', description: 'Title of the assigned task', example: 'Review Q1 designs' },
      { name: 'channelName', description: 'Channel the task belongs to', example: 'Product Roadmap' },
      { name: 'taskUrl', description: 'Direct link to the task', example: 'https://kanthink.com/task/abc123' },
    ],
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
    variables: [
      { name: 'assignerName', description: 'Name of the person who assigned the card', example: 'Jordan' },
      { name: 'cardTitle', description: 'Title of the assigned card', example: 'Fix login bug' },
      { name: 'channelName', description: 'Channel the card belongs to', example: 'Engineering' },
      { name: 'cardUrl', description: 'Direct link to the card', example: 'https://kanthink.com/card/abc123' },
    ],
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'settingsUrl', description: 'Link to billing settings', example: 'https://kanthink.com/settings/billing' },
    ],
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'tier', description: 'Subscription tier name', example: 'Pro' },
    ],
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'endDate', description: 'When access ends', example: 'April 15, 2026' },
    ],
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'used', description: 'Number of AI requests used', example: '80' },
      { name: 'limit', description: 'Total AI request limit', example: '100' },
      { name: 'tier', description: 'Subscription tier name', example: 'Pro' },
      { name: 'upgradeUrl', description: 'Link to upgrade plan', example: 'https://kanthink.com/settings/billing' },
    ],
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
    variables: [
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'limit', description: 'Total AI request limit', example: '100' },
      { name: 'tier', description: 'Subscription tier name', example: 'Pro' },
      { name: 'upgradeUrl', description: 'Link to upgrade plan', example: 'https://kanthink.com/settings/billing' },
      { name: 'resetDate', description: 'When the usage limit resets', example: 'April 1, 2026' },
    ],
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
    variables: [
      { name: 'channelName', description: 'Name of the channel', example: 'Product Roadmap' },
      { name: 'userName', description: "User's display name", example: 'Alex' },
      { name: 'periodLabel', description: 'Digest frequency (daily/weekly/monthly)', example: 'weekly' },
      { name: 'aiSummary', description: 'AI-generated summary of activity (can be null)', example: 'Busy week — 12 cards moved to Done.' },
      { name: 'channelUrl', description: 'Direct link to the channel', example: 'https://kanthink.com/channel/abc123' },
    ],
  },
]

export function getEmailBySlug(slug: string): EmailDefinition | undefined {
  return emailRegistry.find((e) => e.slug === slug)
}
