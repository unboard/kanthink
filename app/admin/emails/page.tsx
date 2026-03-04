import { EmailPreviewer } from './EmailPreviewer'

const templates = [
  { slug: 'welcome', label: 'Welcome' },
  { slug: 'channel-invite', label: 'Channel Invite' },
  { slug: 'task-assigned', label: 'Task Assigned' },
  { slug: 'card-assigned', label: 'Card Assigned' },
  { slug: 'payment-failed', label: 'Payment Failed' },
  { slug: 'subscription-confirmed', label: 'Subscription Confirmed' },
  { slug: 'subscription-canceled', label: 'Subscription Canceled' },
  { slug: 'usage-limit-warning', label: 'Usage Limit Warning' },
  { slug: 'usage-limit-reached', label: 'Usage Limit Reached' },
]

export default function AdminEmailsPage() {
  return (
    <EmailPreviewer templates={templates} />
  )
}
