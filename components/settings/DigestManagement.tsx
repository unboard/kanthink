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
    // Optimistic update
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
      // Refetch on error
      fetch('/api/notifications/digests')
        .then(r => r.json())
        .then(data => setDigests(data.digests || []))
        .catch(() => {})
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Channel Digests</h3>
        <p className="text-xs text-neutral-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Channel Digests</h3>
        <p className="text-xs text-neutral-500 mt-1">
          Receive periodic summaries of channel activity from Kan. Subscribe in each channel&apos;s settings.
        </p>
      </div>

      {digests.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
          No digest subscriptions yet. Enable digests in a channel&apos;s settings to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {digests.map(digest => (
            <div key={digest.id} className="flex items-center justify-between">
              <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate mr-3">
                {digest.channelName}
              </span>
              <select
                value={digest.frequency}
                onChange={(e) => updateFrequency(digest.channelId, e.target.value)}
                className="text-sm rounded-md border border-neutral-300 bg-white px-2 py-1 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="off">Off</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
