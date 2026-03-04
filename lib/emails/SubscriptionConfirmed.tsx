import { Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface SubscriptionConfirmedProps {
  userName: string
  tier: string
}

export function SubscriptionConfirmed({ userName, tier }: SubscriptionConfirmedProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText={`Your ${tier} subscription is active`}>
      <Text style={heading}>Subscription confirmed</Text>
      <Text style={paragraph}>
        Hi {name}, your <strong>{tier}</strong> subscription is now active.
        Enjoy your expanded limits and premium features!
      </Text>
      <Text style={muted}>
        Manage your subscription anytime from Settings.
      </Text>
    </BaseLayout>
  )
}

SubscriptionConfirmed.PreviewProps = {
  userName: 'Alice',
  tier: 'Premium',
} satisfies SubscriptionConfirmedProps

export default SubscriptionConfirmed

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const muted = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0' }
