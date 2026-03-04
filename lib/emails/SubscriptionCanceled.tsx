import { Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface SubscriptionCanceledProps {
  userName: string
  endDate: string
}

export function SubscriptionCanceled({ userName, endDate }: SubscriptionCanceledProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText="Your subscription has been canceled">
      <Text style={heading}>Subscription canceled</Text>
      <Text style={paragraph}>
        Hi {name}, your Kanthink Premium subscription has been canceled.
        You&apos;ll retain access until <strong>{endDate}</strong>, then
        your account will revert to the free tier.
      </Text>
      <Text style={muted}>
        You can resubscribe anytime from Settings.
      </Text>
    </BaseLayout>
  )
}

SubscriptionCanceled.PreviewProps = {
  userName: 'Alice',
  endDate: 'April 15, 2026',
} satisfies SubscriptionCanceledProps

export default SubscriptionCanceled

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const muted = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0' }
