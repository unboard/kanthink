import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface SparkEmailProps {
  /** This morning's spark, when there is one. */
  title?: string
  /** The spark's write-up, plain text. */
  body: string
  /** What the ideas already moving need from you, one line each. */
  nudges?: string[]
  /** One line about what else happened overnight, or empty. */
  overnight?: string
  homeUrl: string
  settingsUrl: string
}

/**
 * The morning, for when you're not in Kanthink: a new idea from what you've been
 * into, and what the ideas already moving need from you.
 *
 * Sent once a day at most. The button opens Home with it already there, so the
 * answer happens where Kan can act on it.
 */
export function SparkEmail({ title, body, nudges = [], overnight, homeUrl, settingsUrl }: SparkEmailProps) {
  const paragraphs = body.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 7)
  const preview = title ? `A spark: ${title}` : nudges[0] || 'Your ideas this morning'
  return (
    <BaseLayout previewText={preview}>
      {title && <Text style={heading}>A spark: {title}</Text>}
      {paragraphs.map((p, i) => <Text key={i} style={paragraph}>{p}</Text>)}
      {title && <Text style={paragraph}>Want a test page for it? Answer Kan and it’s up.</Text>}
      {nudges.length > 0 && <Text style={title ? subheading : heading}>Moving</Text>}
      {nudges.map((n, i) => <Text key={`n${i}`} style={paragraph}>• {n}</Text>)}
      {overnight && <Text style={paragraph}>Also overnight: {overnight}</Text>}
      <Button href={homeUrl} style={button}>Answer Kan</Button>
      <Text style={muted}>
        One email a morning, never more. <a href={settingsUrl} style={{ color: '#a1a1aa' }}>Turn these off</a>.
      </Text>
    </BaseLayout>
  )
}

SparkEmail.PreviewProps = {
  title: 'Proof in Hand',
  body: 'Print proofs your customers can hold: the door hanger on a door, the tri-fold opening, the banner on its stand. People approve faster when they can see it.\n\nSparked by “What if a calendar could stand up?” and your 109 min on 4over.com\n\nFirst move (today): put up the test page and send it to three printers you know.',
  nudges: ['3 people reserved Bookmark Radio. That’s a real signal. Say “build it” and Kan builds into the same app, so they become your first customers.'],
  overnight: '1 email draft is waiting in People.',
  homeUrl: 'https://kanthink.com/',
  settingsUrl: 'https://kanthink.com/people?settings=1',
} satisfies SparkEmailProps

export default SparkEmail

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 14px', whiteSpace: 'pre-wrap' as const }
const subheading = { fontSize: '16px', fontWeight: '600' as const, color: '#18181b', margin: '22px 0 10px' }
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
  margin: '4px 0 18px',
}
