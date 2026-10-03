import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface AppOrderConfirmedProps {
  buyerName: string
  shopName: string
  /** The 5-digit order number, as the seller sees it. */
  orderNumber: string
  item: string
  quantity: number
  /** Already formatted: "$2.00". */
  amount: string
  /** How they get it, in the seller's words. Empty when the seller hasn't said. */
  fulfilmentNote: string
  shopUrl: string
}

/**
 * The buyer's receipt for an order in a shop built on Kanthink.
 *
 * What they bought, what they paid, the order number to quote, and what happens
 * next, which for a local shop is the part they actually need.
 */
export function AppOrderConfirmed({ buyerName, shopName, orderNumber, item, quantity, amount, fulfilmentNote, shopUrl }: AppOrderConfirmedProps) {
  const name = buyerName || 'there'
  return (
    <BaseLayout previewText={`Order #${orderNumber} from ${shopName} is confirmed`}>
      <Text style={heading}>Order #{orderNumber} is confirmed</Text>
      <Text style={paragraph}>
        Hi {name}, thanks for your order from <strong>{shopName}</strong>.
      </Text>
      <Text style={line}>
        {quantity > 1 ? `${quantity} × ` : ''}{item}
        <br />
        <span style={mutedInline}>Paid {amount}</span>
      </Text>
      {fulfilmentNote ? (
        <Text style={paragraph}><strong>What happens next:</strong> {fulfilmentNote}</Text>
      ) : (
        <Text style={paragraph}>{shopName} will be in touch about getting it to you.</Text>
      )}
      <Button href={shopUrl} style={button}>
        Back to {shopName}
      </Button>
      <Text style={muted}>
        Questions about your order? Open the shop and use the Feedback button. It goes straight
        to the seller. Quote order #{orderNumber}.
      </Text>
    </BaseLayout>
  )
}

AppOrderConfirmed.PreviewProps = {
  buyerName: 'Dustin',
  shopName: 'Boo Rocks',
  orderNumber: '48213',
  item: 'Kitty rock!',
  quantity: 1,
  amount: '$2.00',
  fulfilmentNote: 'Local pickup in Fargo only. We\'ll contact you to arrange a time.',
  shopUrl: 'https://kanthink.com/play/abc123',
} satisfies AppOrderConfirmedProps

export default AppOrderConfirmed

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const line = { fontSize: '15px', lineHeight: '24px', color: '#18181b', margin: '0 0 16px', padding: '12px 14px', border: '1px solid #e4e4e7', borderRadius: '10px' }
const mutedInline = { fontSize: '13px', color: '#71717a' }
const muted = { fontSize: '12px', lineHeight: '20px', color: '#a1a1aa', margin: '20px 0 0' }
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
