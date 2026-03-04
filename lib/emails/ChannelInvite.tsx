import { Text, Link, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface ChannelInviteProps {
  inviterName: string
  channelName: string
  signUpUrl: string
}

export function ChannelInvite({ inviterName, channelName, signUpUrl }: ChannelInviteProps) {
  return (
    <BaseLayout previewText={`${inviterName} invited you to "${channelName}"`}>
      <Text style={heading}>You've been invited</Text>
      <Text style={paragraph}>
        <strong>{inviterName}</strong> invited you to collaborate on the channel{' '}
        <strong>&ldquo;{channelName}&rdquo;</strong> in Kanthink.
      </Text>
      <Button href={signUpUrl} style={button}>
        Accept Invite
      </Button>
      <Text style={muted}>
        If you weren&apos;t expecting this, you can safely ignore this email.
      </Text>
    </BaseLayout>
  )
}

ChannelInvite.PreviewProps = {
  inviterName: 'Bob',
  channelName: 'Product Roadmap',
  signUpUrl: 'https://kanthink.com/invite/abc123',
} satisfies ChannelInviteProps

export default ChannelInvite

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
