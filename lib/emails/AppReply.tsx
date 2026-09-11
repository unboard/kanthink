import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface AppReplyProps {
  appTitle: string
  publisherName: string
  message: string
  appUrl: string
}

/**
 * The maker of an app answering someone who used it.
 *
 * Sent because most people who leave feedback on a web app never come back to the
 * page, so a reply that only lives inside the app is a reply nobody reads. The
 * conversation still lives in the app — this just points at it.
 */
export function AppReply({ appTitle, publisherName, message, appUrl }: AppReplyProps) {
  return (
    <BaseLayout previewText={`Reply about ${appTitle}`}>
      <Text style={heading}>Reply about {appTitle}</Text>
      <Text style={paragraph}>
        {publisherName || 'The person who made it'} answered what you said:
      </Text>
      <Text style={quote}>{message}</Text>
      <Button href={appUrl} style={button}>
        Open {appTitle}
      </Button>
      <Text style={muted}>
        Reply from the Feedback button inside the app — that is where the whole
        conversation lives.
      </Text>
    </BaseLayout>
  )
}

AppReply.PreviewProps = {
  appTitle: 'Cat Math Adventure',
  publisherName: 'Dan',
  message: 'Good catch — the timer was starting at zero. Fixed in the latest version.',
  appUrl: 'https://kanthink.com/play/abc123',
} satisfies AppReplyProps

export default AppReply

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 12px' }
const quote = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#18181b',
  margin: '0 0 20px',
  padding: '12px 16px',
  backgroundColor: '#f4f4f5',
  borderLeft: '3px solid #7c3aed',
  borderRadius: '6px',
  whiteSpace: 'pre-wrap' as const,
}
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
