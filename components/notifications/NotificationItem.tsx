'use client'

import { useRouter } from 'next/navigation'
import { type NotificationData, getCategoryForType } from '@/lib/notifications/types'
import { useNav } from '@/components/providers/NavProvider'

interface NotificationItemProps {
  notification: NotificationData
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}

function getCategoryIcon(notification: NotificationData) {
  const category = getCategoryForType(notification.type)
  switch (category) {
    case 'collaboration':
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      )
    case 'ai':
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      )
    case 'automation':
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      )
    case 'board_activity':
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
      )
  }
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

/** Build the best navigation URL from the notification data */
function getNavigationUrl(notification: NotificationData): string | null {
  const data = notification.data as Record<string, unknown> | null
  if (!data) return null

  const channelId = data.channelId as string | undefined
  if (!channelId) return null

  // Navigate to channel - the most we can do currently
  return `/channel/${channelId}`
}

/** Get a human-readable label for the notification type */
function getTypeLabel(notification: NotificationData): string | null {
  switch (notification.type) {
    case 'card_assigned': return 'Card'
    case 'task_assigned': return 'Task'
    case 'mentioned_in_card': return 'Mention'
    case 'channel_shared': return 'Shared'
    case 'channel_join_via_link': return 'Joined'
    case 'shroom_completed': return 'Shroom'
    case 'ai_generation_completed': return 'AI'
    case 'ai_instruction_refinement': return 'AI'
    case 'ai_clarifying_questions': return 'Insights'
    case 'drift_detected': return 'Drift'
    case 'automation_completed': return 'Auto'
    case 'threshold_fired': return 'Threshold'
    case 'safeguard_tripped': return 'Safeguard'
    case 'card_added_by_other': return 'Card'
    case 'card_moved_by_other': return 'Card'
    default: return null
  }
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const router = useRouter()
  const { closePanel } = useNav()

  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.id)
    }

    const url = getNavigationUrl(notification)
    if (url) {
      closePanel()
      router.push(url)
    }
  }

  const url = getNavigationUrl(notification)
  const typeLabel = getTypeLabel(notification)

  return (
    <div
      className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
        !notification.isRead ? 'bg-violet-50/40 dark:bg-violet-900/10' : ''
      }`}
      onClick={handleClick}
    >
      {/* Category icon */}
      <div className="flex-shrink-0">
        {getCategoryIcon(notification)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${!notification.isRead ? 'font-semibold text-neutral-900 dark:text-white' : 'text-neutral-700 dark:text-neutral-300'}`}>
            {notification.title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!notification.isRead && (
              <span className="w-2 h-2 rounded-full bg-violet-500" />
            )}
          </div>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
          {notification.body}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            {getRelativeTime(notification.createdAt)}
          </span>
          {typeLabel && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                {typeLabel}
              </span>
            </>
          )}
          {url && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-[11px] text-violet-500 dark:text-violet-400">
                View →
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
