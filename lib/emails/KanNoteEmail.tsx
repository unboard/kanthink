import { Button, Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface KanNoteEmailProps {
  /** What it's about: the thing they shared, or the app Kan would build. */
  title: string
  /** Kan's note, plain text, paragraphs split by blank lines. */
  body: string
  ctaLabel: string
  ctaUrl: string
}

/**
 * Kan writing to its owner about something they shared: its take, or the brief for
 * an app it's ready to build. Only ever sent because they asked for it on the share.
 */
export function KanNoteEmail({ title, body, ctaLabel, ctaUrl }: KanNoteEmailProps) {
  const paragraphs = body.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 14)
  return (
    <BaseLayout previewText={paragraphs[0]?.slice(0, 120) || title}>
      <Text style={heading}>{title}</Text>
      {paragraphs.map((p, i) => <Text key={i} style={paragraph}>{p}</Text>)}
      <Button href={ctaUrl} style={button}>{ctaLabel}</Button>
      <Text style={muted}>Sent because you asked for it when you shared this.</Text>
    </BaseLayout>
  )
}

KanNoteEmail.PreviewProps = {
  title: 'Visual Remix Studio',
  body: 'The part that makes Studia work is that what you say, where your cursor is and what you draw all become one instruction.\n\nYour version: drop images on an infinite canvas, talk while you point and doodle, and the new image lands right next to its sources.',
  ctaLabel: 'Build it or change it',
  ctaUrl: 'https://www.kanthink.com/prototypes/kan/city',
} satisfies KanNoteEmailProps

export default KanNoteEmail

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
