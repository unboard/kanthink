import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface UsageLimitWarningProps {
  userName: string
  used: number
  limit: number
  tier: string
  upgradeUrl: string
}

export function UsageLimitWarning({ userName, used, limit, tier, upgradeUrl }: UsageLimitWarningProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText={`You've used ${used} of ${limit} AI requests`}>
      <Text style={heading}>You&apos;re approaching your limit</Text>
      <Text style={paragraph}>
        Hi {name}, you&apos;ve used <strong>{used}</strong> of <strong>{limit}</strong> AI
        requests on your <strong>{tier}</strong> plan this month.
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

UsageLimitWarning.PreviewProps = {
  userName: 'Alice',
  used: 8,
  limit: 10,
  tier: 'free',
  upgradeUrl: 'https://kanthink.com/settings/billing',
} satisfies UsageLimitWarningProps

export default UsageLimitWarning

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
