'use client'

import { useState, useCallback } from 'react'
import { useNotificationStore } from '@/lib/notificationStore'
import { requestNotificationPermission } from '@/lib/notifications/serviceWorker'
import { NotificationItem } from './NotificationItem'

interface NotificationCenterProps {
  onClose: () => void
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const hasPermission = useNotificationStore((s) => s.hasPermission)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)
  const dismissNotification = useNotificationStore((s) => s.dismissNotification)
  const setHasPermission = useNotificationStore((s) => s.setHasPermission)
  const loadNotifications = useNotificationStore((s) => s.loadNotifications)

  const [displayCount, setDisplayCount] = useState(20)
  const [loadingMore, setLoadingMore] = useState(false)

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission()
    setHasPermission(result === 'granted')

    // Save preference to server
    if (result === 'granted') {
      fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browserNotificationsEnabled: true }),
      }).catch(() => {})
    }
  }

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/notifications?limit=50&offset=${notifications.length}`)
      const data = await res.json()
      if (data.notifications?.length > 0) {
        loadNotifications([...notifications, ...data.notifications])
        setDisplayCount(prev => prev + 20)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }, [notifications, loadNotifications])

  const showPermissionBanner = typeof window !== 'undefined'
    && 'Notification' in window
    && hasPermission === false
    && Notification.permission === 'default'

  const visibleNotifications = notifications.slice(0, displayCount)

  return (
    <div className="flex flex-col h-full max-h-[70vh] md:max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {unreadCount} unread
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Permission banner */}
      {showPermissionBanner && (
        <div className="px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Enable browser notifications for alerts when this tab is hidden.
            </p>
            <button
              onClick={handleRequestPermission}
              className="flex-shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700"
            >
              Enable
            </button>
          </div>
        </div>
      )}

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-400 dark:text-neutral-600">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={markAsRead}
                  onDismiss={dismissNotification}
                />
              ))}
            </div>

            {/* Load more */}
            {notifications.length > displayCount && (
              <div className="px-4 py-3 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
