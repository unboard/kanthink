import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface UsageLimitReachedProps {
  userName: string
  limit: number
  tier: string
  upgradeUrl: string
  resetDate: string
}

export function UsageLimitReached({ userName, limit, tier, upgradeUrl, resetDate }: UsageLimitReachedProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText={`You've reached your ${limit} request limit`}>
      <Text style={heading}>Usage limit reached</Text>
      <Text style={paragraph}>
        Hi {name}, you&apos;ve used all <strong>{limit}</strong> AI requests
        on your <strong>{tier}</strong> plan this month. Your limit resets
        on <strong>{resetDate}</strong>.
      </Text>
      <Button href={upgradeUrl} style={button}>
        Upgrade Plan
      </Button>
      <Text style={muted}>
        Or add your own API key in Settings for unlimited usage.
      </Text>
    </BaseLayout>
  )
}

UsageLimitReached.PreviewProps = {
  userName: 'Alice',
  limit: 10,
  tier: 'free',
  upgradeUrl: 'https://kanthink.com/settings/billing',
  resetDate: 'April 1, 2026',
} satisfies UsageLimitReachedProps

export default UsageLimitReached

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 24px' }
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block' as const,
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  textDecoration: 'none',
}
const muted = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0' }
