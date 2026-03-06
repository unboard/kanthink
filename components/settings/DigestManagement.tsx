'use client'

import { useState, useEffect, useCallback } from 'react'

interface DigestSub {
  id: string
  channelId: string
  channelName: string
  frequency: 'daily' | 'weekly' | 'monthly'
  muted: boolean
}

export function DigestManagement() {
  const [digests, setDigests] = useState<DigestSub[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/notifications/digests')
      .then(r => r.json())
      .then(data => setDigests(data.digests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const updateFrequency = useCallback(async (channelId: string, frequency: string) => {
    if (frequency === 'off') {
      setDigests(prev => prev.filter(d => d.channelId !== channelId))
    } else {
      setDigests(prev => prev.map(d =>
        d.channelId === channelId ? { ...d, frequency: frequency as DigestSub['frequency'] } : d
      ))
    }

    try {
      await fetch(`/api/channels/${channelId}/digest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency }),
      })
    } catch {
      fetch('/api/notifications/digests')
        .then(r => r.json())
        .then(data => setDigests(data.digests || []))
        .catch(() => {})
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Channel Digests</h2>
          <p className="mt-1 text-sm text-neutral-500">Loading...</p>
        </div>
        <div className="animate-pulse">
          <div className="h-12 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Channel Digests</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Periodic activity summaries from Kan, delivered to your inbox. Subscribe per-channel in each channel&apos;s settings.
        </p>
      </div>

      {digests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center">
          <svg className="mx-auto h-8 w-8 text-neutral-400 dark:text-neutral-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No digest subscriptions yet
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            Open a channel&apos;s settings and turn on email digests to see them here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {digests.map(digest => (
            <div
              key={digest.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3"
            >
              <div className="min-w-0 mr-3">
                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                  {digest.channelName}
                </p>
              </div>
              <select
                value={digest.frequency}
                onChange={(e) => updateFrequency(digest.channelId, e.target.value)}
                className="shrink-0 text-sm rounded-md border border-neutral-300 bg-white px-2 py-1.5 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="off">Remove</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
