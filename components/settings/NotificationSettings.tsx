'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotificationStore } from '@/lib/notificationStore'
import { requestNotificationPermission } from '@/lib/notifications/serviceWorker'
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationType } from '@/lib/notifications/types'

interface Preferences {
  disabledTypes: string[]
  browserNotificationsEnabled: boolean
}

export function NotificationSettings() {
  const hasPermission = useNotificationStore((s) => s.hasPermission)
  const setHasPermission = useNotificationStore((s) => s.setHasPermission)

  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState(false)

  // Load preferences
  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then(r => r.json())
      .then(data => setPrefs(data.preferences))
      .catch(() => {})
  }, [])

  const savePrefs = useCallback(async (updated: Preferences) => {
    setPrefs(updated)
    setSaving(true)
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }, [])

  const handleBrowserToggle = async () => {
    if (!hasPermission) {
      const result = await requestNotificationPermission()
      setHasPermission(result === 'granted')
      if (result === 'granted' && prefs) {
        savePrefs({ ...prefs, browserNotificationsEnabled: true })
      }
    } else if (prefs) {
      savePrefs({ ...prefs, browserNotificationsEnabled: !prefs.browserNotificationsEnabled })
    }
  }

  const isCategoryDisabled = (category: NotificationCategory): boolean => {
    if (!prefs) return false
    const types = NOTIFICATION_CATEGORIES[category].types
    return types.every(t => prefs.disabledTypes.includes(t))
  }

  const toggleCategory = (category: NotificationCategory) => {
    if (!prefs) return
    const types = NOTIFICATION_CATEGORIES[category].types
    const allDisabled = isCategoryDisabled(category)

    let newDisabled: string[]
    if (allDisabled) {
      // Enable all types in this category
      newDisabled = prefs.disabledTypes.filter(t => !types.includes(t as NotificationType))
    } else {
      // Disable all types in this category
      const toAdd = types.filter(t => !prefs.disabledTypes.includes(t))
      newDisabled = [...prefs.disabledTypes, ...toAdd]
    }

    savePrefs({ ...prefs, disabledTypes: newDisabled })
  }

  if (!prefs) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Notifications</h3>
        <p className="text-xs text-neutral-500">Loading...</p>
      </div>
    )
  }

  const browserNotifAvailable = typeof window !== 'undefined' && 'Notification' in window
  const permissionDenied = browserNotifAvailable && Notification.permission === 'denied'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Notifications</h3>

      {/* Browser notifications toggle */}
      {browserNotifAvailable && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">Browser notifications</p>
            <p className="text-xs text-neutral-500">
              {permissionDenied
                ? 'Blocked in browser settings'
                : 'Show system notifications when tab is hidden'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBrowserToggle}
            disabled={permissionDenied}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prefs.browserNotificationsEnabled && hasPermission
                ? 'bg-violet-500'
                : 'bg-neutral-300 dark:bg-neutral-600'
            } ${permissionDenied ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                prefs.browserNotificationsEnabled && hasPermission ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Category toggles */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Notification categories
        </p>
        {(Object.entries(NOTIFICATION_CATEGORIES) as [NotificationCategory, typeof NOTIFICATION_CATEGORIES[NotificationCategory]][]).map(
          ([key, config]) => {
            const disabled = isCategoryDisabled(key)
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  {config.label}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCategory(key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    !disabled ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      !disabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )
          }
        )}
      </div>

      {saving && (
        <p className="text-xs text-neutral-400">Saving...</p>
      )}
    </div>
  )
}
