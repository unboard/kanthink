import { auth, isAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
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

export default async function AdminEmailsPage() {
  const session = await auth()
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect('/')
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-zinc-950">
      <div className="flex items-center px-4 h-16 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Email Templates</h1>
        <a
          href="/"
          className="ml-auto text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Back to app
        </a>
      </div>
      <EmailPreviewer templates={templates} />
    </div>
  )
}
