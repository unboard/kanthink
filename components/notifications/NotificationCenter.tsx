'use client'

import { useState, useCallback } from 'react'
import { useNotificationStore, type NotificationTab } from '@/lib/notificationStore'
import { requestNotificationPermission } from '@/lib/notifications/serviceWorker'
import { NotificationItem } from './NotificationItem'

interface NotificationCenterProps {
  onClose: () => void
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const hasPermission = useNotificationStore((s) => s.hasPermission)
  const activeTab = useNotificationStore((s) => s.activeTab)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)
  const dismissNotification = useNotificationStore((s) => s.dismissNotification)
  const setHasPermission = useNotificationStore((s) => s.setHasPermission)
  const setActiveTab = useNotificationStore((s) => s.setActiveTab)
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

  // Filter by tab
  const filteredNotifications = activeTab === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications
  const visibleNotifications = filteredNotifications.slice(0, displayCount)
  const hasMore = activeTab === 'all' && notifications.length > displayCount

  const tabs: { key: NotificationTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadCount },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + Mark all read */}
      <div className="px-4 pt-3 pb-0">
        {/* Mark all read */}
        {unreadCount > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={markAllAsRead}
              className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
            >
              Mark all read
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full ${
                  activeTab === tab.key
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
                }`}>
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Permission banner */}
      {showPermissionBanner && (
        <div className="mx-4 mt-3 px-3 py-2.5 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200/50 dark:border-violet-800/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Enable push notifications
              </p>
            </div>
            <button
              onClick={handleRequestPermission}
              className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors"
            >
              Enable
            </button>
          </div>
        </div>
      )}

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto mt-2">
        {visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-600">
            <svg className="w-10 h-10 mb-3 text-neutral-300 dark:text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {activeTab === 'unread' ? 'All caught up' : 'No notifications yet'}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              {activeTab === 'unread' ? 'No unread notifications' : 'Notifications will appear here'}
            </p>
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
            {hasMore && (
              <div className="px-4 py-3 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 disabled:opacity-50"
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
