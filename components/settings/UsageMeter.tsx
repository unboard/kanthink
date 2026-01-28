'use client'

import { useEffect, useState } from 'react'

interface UsageData {
  used: number
  limit: number | null
  remaining: number | null
  tier: 'free' | 'premium'
  hasByok: boolean
  resetAt: string
}

export function UsageMeter() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch('/api/usage')
        if (response.ok) {
          const data = await response.json()
          setUsage(data)
        }
      } catch (error) {
        console.error('Failed to fetch usage:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUsage()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full" />
      </div>
    )
  }

  if (!usage) {
    return null
  }

  // BYOK users have unlimited
  if (usage.hasByok) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">AI Requests</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            Unlimited (using your API key)
          </span>
        </div>
      </div>
    )
  }

  const percentage = usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0
  const isNearLimit = usage.remaining !== null && usage.remaining <= 3
  const isAtLimit = usage.remaining === 0

  const resetDate = new Date(usage.resetAt)
  const resetDateStr = resetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">AI Requests</span>
        <span className={`font-medium ${
          isAtLimit
            ? 'text-red-600 dark:text-red-400'
            : isNearLimit
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-neutral-900 dark:text-white'
        }`}>
          {usage.used} / {usage.limit} used
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit
              ? 'bg-red-500'
              : isNearLimit
              ? 'bg-amber-500'
              : 'bg-violet-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-xs text-neutral-500">
        {isAtLimit
          ? 'Upgrade or add your own API key for more requests'
          : `Resets ${resetDateStr}`}
      </p>
    </div>
  )
}
