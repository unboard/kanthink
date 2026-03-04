import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface PaymentFailedProps {
  userName: string
  settingsUrl: string
}

export function PaymentFailed({ userName, settingsUrl }: PaymentFailedProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText="Your payment could not be processed">
      <Text style={heading}>Payment failed</Text>
      <Text style={paragraph}>
        Hi {name}, we were unable to process your latest payment for Kanthink Premium.
        Please update your billing details to continue your subscription.
      </Text>
      <Button href={settingsUrl} style={button}>
        Update Billing
      </Button>
      <Text style={muted}>
        If this was resolved, you can ignore this email.
      </Text>
    </BaseLayout>
  )
}

PaymentFailed.PreviewProps = {
  userName: 'Alice',
  settingsUrl: 'https://kanthink.com/settings/billing',
} satisfies PaymentFailedProps

export default PaymentFailed

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
