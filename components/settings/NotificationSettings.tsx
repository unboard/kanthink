'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotificationStore } from '@/lib/notificationStore'
import { requestNotificationPermission } from '@/lib/notifications/serviceWorker'
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationType } from '@/lib/notifications/types'

interface Preferences {
  disabledTypes: string[]
  browserNotificationsEnabled: boolean
  emailNotificationsEnabled: boolean
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function NotificationSettings() {
  const hasPermission = useNotificationStore((s) => s.hasPermission)
  const setHasPermission = useNotificationStore((s) => s.setHasPermission)

  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [saving, setSaving] = useState(false)

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
      newDisabled = prefs.disabledTypes.filter(t => !types.includes(t as NotificationType))
    } else {
      const toAdd = types.filter(t => !prefs.disabledTypes.includes(t))
      newDisabled = [...prefs.disabledTypes, ...toAdd]
    }

    savePrefs({ ...prefs, disabledTypes: newDisabled })
  }

  if (!prefs) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-500">Loading preferences...</p>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-14 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          <div className="h-14 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const browserNotifAvailable = typeof window !== 'undefined' && 'Notification' in window
  const permissionDenied = browserNotifAvailable && Notification.permission === 'denied'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Notifications</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Control how and when Kanthink reaches you
        </p>
      </div>

      {/* Delivery methods */}
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
          Delivery
        </h3>

        <div className="space-y-4">
          {/* Email */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                <svg className="h-4 w-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Email</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Assignments, invitations, and digest summaries sent to your inbox
                </p>
              </div>
            </div>
            <Toggle
              enabled={prefs.emailNotificationsEnabled}
              onChange={() => savePrefs({ ...prefs, emailNotificationsEnabled: !prefs.emailNotificationsEnabled })}
            />
          </div>

          {!prefs.emailNotificationsEnabled && (
            <div className="ml-11 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Email is off. You won&apos;t receive assignment emails or channel digests.
              </p>
            </div>
          )}

          {/* Browser */}
          {browserNotifAvailable && (
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <svg className="h-4 w-4 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Browser push</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {permissionDenied
                      ? 'Blocked by your browser. Update your browser notification permissions to enable.'
                      : 'Desktop notifications when this tab is in the background'}
                  </p>
                </div>
              </div>
              <Toggle
                enabled={!!(prefs.browserNotificationsEnabled && hasPermission)}
                onChange={handleBrowserToggle}
                disabled={permissionDenied}
              />
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      {/* Category toggles */}
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
          What to notify
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Turn off categories you don&apos;t need. This applies to both email and browser notifications.
        </p>

        <div className="space-y-3">
          {(Object.entries(NOTIFICATION_CATEGORIES) as [NotificationCategory, typeof NOTIFICATION_CATEGORIES[NotificationCategory]][]).map(
            ([key, config]) => {
              const disabled = isCategoryDisabled(key)
              return (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
                    disabled
                      ? 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50'
                      : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${
                      disabled
                        ? 'text-neutral-400 dark:text-neutral-500'
                        : 'text-neutral-900 dark:text-white'
                    }`}>
                      {config.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      disabled ? 'text-neutral-400 dark:text-neutral-600' : 'text-neutral-500'
                    }`}>
                      {config.description}
                    </p>
                  </div>
                  <Toggle
                    enabled={!disabled}
                    onChange={() => toggleCategory(key)}
                  />
                </div>
              )
            }
          )}
        </div>
      </div>

      {saving && (
        <p className="text-xs text-neutral-400 animate-pulse">Saving...</p>
      )}
    </div>
  )
}
