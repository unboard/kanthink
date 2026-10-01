import { Button, Link, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface PersonEmailProps {
  appTitle: string
  publisherName: string
  /** Plain text. Blank lines are paragraphs; a bare URL on its own line becomes a button. */
  body: string
  appUrl: string
  unsubscribeUrl: string
}

/**
 * An email to someone who uses one of your apps, written by you or drafted by Kan
 * and approved by you.
 *
 * Reads like a note from a person, not a newsletter: no hero, no banner, the words
 * and one button. The footer says who it's from and how to stop it, which is what
 * the law asks of any email about something for sale, and what decency asks anyway.
 */
export function PersonEmail({ appTitle, publisherName, body, appUrl, unsubscribeUrl }: PersonEmailProps) {
  const blocks = body.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const isUrl = (b: string) => /^https?:\/\/\S+$/.test(b)
  const firstLine = blocks.find((b) => !isUrl(b)) || appTitle

  return (
    <BaseLayout previewText={firstLine.slice(0, 120)}>
      {blocks.map((b, i) =>
        isUrl(b) ? (
          <Button key={i} href={b} style={button}>Open {appTitle}</Button>
        ) : (
          <Text key={i} style={paragraph}>{b}</Text>
        ),
      )}
      <Text style={muted}>
        You’re getting this because you used or reserved {appTitle}
        {publisherName ? `, made by ${publisherName}` : ''}. Reply to this email to answer.{' '}
        <Link href={unsubscribeUrl} style={mutedLink}>Stop emails about {appTitle}</Link>
        {' '}· <Link href={appUrl} style={mutedLink}>{appTitle}</Link>
      </Text>
    </BaseLayout>
  )
}

PersonEmail.PreviewProps = {
  appTitle: 'Fair Rotations',
  publisherName: 'Dustin',
  body: 'Hi Maya,\n\nYou reserved Fair Rotations before it existed, so you’re hearing first: it’s ready. It’s $9 a season.\n\nhttps://kanthink.com/play/abc123\n\nDustin',
  appUrl: 'https://kanthink.com/play/abc123',
  unsubscribeUrl: 'https://kanthink.com/api/people/unsubscribe?u=1&t=x',
} satisfies PersonEmailProps

export default PersonEmail

const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 14px', whiteSpace: 'pre-wrap' as const }
const muted = { fontSize: '12px', lineHeight: '20px', color: '#a1a1aa', margin: '24px 0 0' }
const mutedLink = { color: '#a1a1aa', textDecoration: 'underline' }
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
  margin: '4px 0 18px',
}
