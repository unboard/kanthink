import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface AppMessageProps {
  fromName: string
  appTitle: string
  message: string
  /** The app's People tab in Kanthink, where the whole conversation is. */
  threadUrl: string
  /** True when replying to this email lands in the conversation. */
  replyLands: boolean
}

/**
 * Someone using one of your apps wrote to you. Reply to the email, or open the
 * conversation in Kanthink. Either way they get your answer.
 */
export function AppMessage({ fromName, appTitle, message, threadUrl, replyLands }: AppMessageProps) {
  return (
    <BaseLayout previewText={`${fromName}: ${message.slice(0, 80)}`}>
      <Text style={heading}>{fromName} wrote about {appTitle}</Text>
      <Text style={quote}>{message}</Text>
      <Text style={paragraph}>
        {replyLands
          ? 'Reply to this email to answer. It goes into your conversation with them, and they get it by email.'
          : 'Reply to this email to answer them directly, or open the conversation in Kanthink.'}
      </Text>
      <Button href={threadUrl} style={button}>
        Open the conversation
      </Button>
    </BaseLayout>
  )
}

AppMessage.PreviewProps = {
  fromName: 'Dustin Hodgson',
  appTitle: 'Boo Rocks',
  message: 'Thank you! Does today work?',
  threadUrl: 'https://kanthink.com/channel/x/card/y?app=z&pane=people',
  replyLands: true,
} satisfies AppMessageProps

export default AppMessage

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const quote = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#18181b',
  margin: '0 0 16px',
  padding: '12px 16px',
  borderLeft: '3px solid #7c3aed',
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  whiteSpace: 'pre-wrap' as const,
}
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
  margin: '0 0 8px',
}
