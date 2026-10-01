import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface SparkEmailProps {
  title: string
  /** The scout's write-up, plain text. */
  body: string
  /** One line about what else happened overnight, or empty. */
  overnight?: string
  homeUrl: string
  settingsUrl: string
}

/**
 * The morning spark, for when you're not in Kanthink.
 *
 * The same thing that's waiting on Home, sent once a day at most. The button opens
 * Home with it already there, so the answer happens where Kan can act on it.
 */
export function SparkEmail({ title, body, overnight, homeUrl, settingsUrl }: SparkEmailProps) {
  const paragraphs = body.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 6)
  return (
    <BaseLayout previewText={`A spark: ${title}`}>
      <Text style={heading}>A spark: {title}</Text>
      {paragraphs.map((p, i) => <Text key={i} style={paragraph}>{p}</Text>)}
      <Text style={paragraph}>Want a test page for it? Answer Kan and it’s done.</Text>
      {overnight && <Text style={paragraph}>Also overnight: {overnight}</Text>}
      <Button href={homeUrl} style={button}>Answer Kan</Button>
      <Text style={muted}>
        One spark a morning, never more. <a href={settingsUrl} style={{ color: '#a1a1aa' }}>Turn these off</a>.
      </Text>
    </BaseLayout>
  )
}

SparkEmail.PreviewProps = {
  title: 'Sub Plan Writer',
  body: 'Teachers spend an hour or two writing a sub plan the night before a sick day. 14 posts this month, and nothing sells that just does it.\n\n“Writing sub plans at 11pm with a fever is its own circle of hell.” (teachers forum)',
  overnight: 'Sheet Maker is at 6 of 120 reserved.',
  homeUrl: 'https://kanthink.com/',
  settingsUrl: 'https://kanthink.com/people?settings=1',
} satisfies SparkEmailProps

export default SparkEmail

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 14px', whiteSpace: 'pre-wrap' as const }
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
