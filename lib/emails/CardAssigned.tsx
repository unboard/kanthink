import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface CardAssignedProps {
  assignerName: string
  cardTitle: string
  channelName: string
  cardUrl: string
}

export function CardAssigned({ assignerName, cardTitle, channelName, cardUrl }: CardAssignedProps) {
  return (
    <BaseLayout previewText={`${assignerName} assigned you a card in "${channelName}"`}>
      <Text style={heading}>Card assigned to you</Text>
      <Text style={paragraph}>
        <strong>{assignerName}</strong> assigned you a card in{' '}
        <strong>&ldquo;{channelName}&rdquo;</strong>:
      </Text>
      <Text style={cardBox}>{cardTitle}</Text>
      <Button href={cardUrl} style={button}>
        View Card
      </Button>
    </BaseLayout>
  )
}

CardAssigned.PreviewProps = {
  assignerName: 'Dave',
  cardTitle: 'Redesign onboarding',
  channelName: 'Product Roadmap',
  cardUrl: 'https://kanthink.com/channel/abc/card/456',
} satisfies CardAssignedProps

export default CardAssigned

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const cardBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  color: '#18181b',
  fontSize: '14px',
  fontWeight: '500' as const,
  margin: '0 0 24px',
  padding: '12px 16px',
}
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
