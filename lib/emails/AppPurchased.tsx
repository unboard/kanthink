import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface AppPurchasedProps {
  buyerName: string
  appTitle: string
  /** Already formatted, including any interval — "$4.00" or "$4.00/mo". */
  amount: string
  appUrl: string
  /** Stripe billing portal, for subscriptions. Empty for a one-time purchase. */
  manageBillingUrl?: string
}

/**
 * The receipt for buying a published app.
 *
 * It exists to do one thing well: get the buyer back into what they paid for. The
 * link is the point — the app's own page, which now opens straight through for the
 * email address on this receipt, on any device.
 */
export function AppPurchased({ buyerName, appTitle, amount, appUrl, manageBillingUrl }: AppPurchasedProps) {
  const name = buyerName || 'there'
  return (
    <BaseLayout previewText={`You now have access to ${appTitle}`}>
      <Text style={heading}>You&apos;re in</Text>
      <Text style={paragraph}>
        Hi {name}, thanks for buying <strong>{appTitle}</strong>. You paid <strong>{amount}</strong>.
      </Text>
      <Button href={appUrl} style={button}>
        Open {appTitle}
      </Button>
      <Text style={paragraph}>
        Keep this email. If you ever open the app on another device and it asks who you are,
        use this email address and it will let you straight in — no second payment.
      </Text>
      {manageBillingUrl ? (
        <Text style={muted}>
          This is a recurring plan.{' '}
          <a href={manageBillingUrl} style={link}>Manage or cancel your billing</a> at any time.
        </Text>
      ) : (
        <Text style={muted}>One-time purchase. Nothing further will be charged.</Text>
      )}
      <Text style={muted}>
        Something not working? Open the app and use the Feedback button — it goes straight to
        whoever made it, and their reply comes back to the same place.
      </Text>
    </BaseLayout>
  )
}

AppPurchased.PreviewProps = {
  buyerName: 'Alice',
  appTitle: 'Cat Math Adventure',
  amount: '$4.00',
  appUrl: 'https://kanthink.com/play/abc123',
  manageBillingUrl: '',
} satisfies AppPurchasedProps

export default AppPurchased

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const muted = { fontSize: '12px', lineHeight: '20px', color: '#a1a1aa', margin: '20px 0 0' }
const link = { color: '#7c3aed', textDecoration: 'underline' }
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
  margin: '0 0 20px',
}
