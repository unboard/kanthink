'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

interface UpgradeButtonProps {
  size?: 'sm' | 'md'
  className?: string
}

export function UpgradeButton({ size = 'sm', className }: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('No checkout URL returned')
      }
    } catch (error) {
      console.error('Upgrade error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size={size}
      onClick={handleUpgrade}
      disabled={loading}
      className={className}
    >
      {loading ? 'Loading...' : 'Upgrade'}
    </Button>
  )
}

export function ManageBillingButton({ size = 'sm', className }: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleManage = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'portal' }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('No portal URL returned')
      }
    } catch (error) {
      console.error('Manage billing error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size={size}
      variant="secondary"
      onClick={handleManage}
      disabled={loading}
      className={className}
    >
      {loading ? 'Loading...' : 'Manage Billing'}
    </Button>
  )
}
