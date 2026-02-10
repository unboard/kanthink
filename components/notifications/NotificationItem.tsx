'use client'

import { type NotificationData, getCategoryForType } from '@/lib/notifications/types'

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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'ai':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    case 'automation':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'board_activity':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
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

export function NotificationItem({ notification, onRead, onDismiss }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.id)
    }

    // Navigate if there's a channelId in data
    const channelId = (notification.data as Record<string, unknown>)?.channelId
    if (channelId) {
      window.location.href = `/channel/${channelId}`
    }
  }

  return (
    <div
      className={`flex gap-3 p-3 cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
        !notification.isRead ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''
      }`}
      onClick={handleClick}
    >
      {/* Category icon */}
      <div className="flex-shrink-0 mt-0.5 text-neutral-400 dark:text-neutral-500">
        {getCategoryIcon(notification)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${!notification.isRead ? 'font-medium text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-violet-500" />
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5 line-clamp-2">
          {notification.body}
        </p>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-600 mt-1">
          {getRelativeTime(notification.createdAt)}
        </p>
      </div>
    </div>
  )
}
