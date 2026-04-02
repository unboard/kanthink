import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface MentionedInCardProps {
  mentionerName: string
  cardTitle: string
  channelName: string
  messagePreview: string
  cardUrl: string
}

export function MentionedInCard({ mentionerName, cardTitle, channelName, messagePreview, cardUrl }: MentionedInCardProps) {
  return (
    <BaseLayout previewText={`${mentionerName} mentioned you in "${cardTitle}"`}>
      <Text style={heading}>You were mentioned</Text>
      <Text style={paragraph}>
        <strong>{mentionerName}</strong> mentioned you in{' '}
        <strong>&ldquo;{cardTitle}&rdquo;</strong> in{' '}
        <strong>{channelName}</strong>:
      </Text>
      <Text style={quoteBox}>{messagePreview}</Text>
      <Button href={cardUrl} style={button}>
        View Card
      </Button>
    </BaseLayout>
  )
}

MentionedInCard.PreviewProps = {
  mentionerName: 'Alice',
  cardTitle: 'Q2 Launch Plan',
  channelName: 'Product Roadmap',
  messagePreview: 'Hey @Bob, can you review the timeline for this?',
  cardUrl: 'https://kanthink.com/channel/abc/card/456',
} satisfies MentionedInCardProps

export default MentionedInCard

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const quoteBox = {
  backgroundColor: '#f4f4f5',
  borderLeft: '3px solid #7c3aed',
  borderRadius: '0 6px 6px 0',
  color: '#3f3f46',
  fontSize: '14px',
  fontStyle: 'italic' as const,
  lineHeight: '22px',
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
