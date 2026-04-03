import { Text, Button, Hr, Link, Section, Heading } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

export type EmailStyle = 'professional' | 'casual' | 'newsletter' | 'update';

interface VoiceComposedProps {
  style: EmailStyle
  recipientName?: string
  senderName: string
  subject: string
  body: string // markdown-ish content with \n for line breaks
  ctaText?: string
  ctaUrl?: string
  channelName?: string // if linking to a channel
  cardTitle?: string   // if referencing a card
  cardUrl?: string
}

function parseBody(body: string): React.ReactNode[] {
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={i} />;
    // Headers
    if (trimmed.startsWith('## ')) return <Heading key={i} as="h2" style={h2Style}>{trimmed.slice(3)}</Heading>;
    if (trimmed.startsWith('# ')) return <Heading key={i} as="h1" style={h1Style}>{trimmed.slice(2)}</Heading>;
    // Bullet items
    if (trimmed.startsWith('- ') || trimmed.startsWith('• '))
      return <Text key={i} style={bulletStyle}>{trimmed.slice(2)}</Text>;
    // Numbered items
    if (/^\d+\.\s/.test(trimmed))
      return <Text key={i} style={bulletStyle}>{trimmed}</Text>;
    // Blockquote
    if (trimmed.startsWith('> '))
      return <Text key={i} style={quoteStyle}>{trimmed.slice(2)}</Text>;
    // Regular paragraph
    return <Text key={i} style={paragraphStyle}>{trimmed}</Text>;
  });
}

export function VoiceComposed({ style, recipientName, senderName, subject, body, ctaText, ctaUrl, channelName, cardTitle, cardUrl }: VoiceComposedProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

  return (
    <BaseLayout previewText={subject}>
      {/* Style-specific header */}
      {style === 'newsletter' && (
        <Section style={newsletterBanner}>
          <Text style={newsletterTitle}>{subject}</Text>
        </Section>
      )}

      {style === 'update' && channelName && (
        <Section style={updateBanner}>
          <Text style={updateLabel}>Update from {channelName}</Text>
        </Section>
      )}

      {style !== 'newsletter' && (
        <Text style={greetingStyle}>{greeting}</Text>
      )}

      {/* Body content */}
      {parseBody(body)}

      {/* Card reference */}
      {cardTitle && cardUrl && (
        <>
          <Hr style={divider} />
          <Section style={cardRefBox}>
            <Text style={cardRefLabel}>Referenced card</Text>
            <Link href={cardUrl} style={cardRefLink}>{cardTitle}</Link>
          </Section>
        </>
      )}

      {/* CTA button */}
      {ctaText && ctaUrl && (
        <Section style={{ textAlign: 'center' as const, margin: '24px 0 8px' }}>
          <Button href={ctaUrl} style={ctaButton}>{ctaText}</Button>
        </Section>
      )}

      {/* Sign-off */}
      <Hr style={divider} />
      <Text style={signOff}>
        {style === 'casual' ? `Cheers,\n${senderName}` : `Best,\n${senderName}`}
      </Text>
    </BaseLayout>
  );
}

VoiceComposed.PreviewProps = {
  style: 'professional' as EmailStyle,
  senderName: 'Dustin',
  subject: 'Project Update',
  body: '## Key Updates\n\nThe voice mode feature shipped this week with full bidirectional audio.\n\n- Real-time conversation with Kan\n- Tool calling for workspace actions\n- Email drafting from voice\n\n> This is a significant milestone for the product.\n\nLet me know if you have questions.',
} satisfies VoiceComposedProps;

export default VoiceComposed;

const h1Style = { fontSize: '22px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 12px' };
const h2Style = { fontSize: '18px', fontWeight: '600' as const, color: '#18181b', margin: '20px 0 8px' };
const paragraphStyle = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 12px' };
const bulletStyle = { fontSize: '14px', lineHeight: '22px', color: '#3f3f46', margin: '0 0 4px', paddingLeft: '16px' };
const quoteStyle = { fontSize: '14px', lineHeight: '22px', color: '#52525b', borderLeft: '3px solid #7c3aed', paddingLeft: '12px', margin: '8px 0', fontStyle: 'italic' as const };
const greetingStyle = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' };
const signOff = { fontSize: '14px', color: '#71717a', margin: '0', whiteSpace: 'pre-line' as const };
const divider = { borderColor: '#e4e4e7', margin: '20px 0' };
const ctaButton = { backgroundColor: '#7c3aed', borderRadius: '6px', color: '#ffffff', display: 'inline-block' as const, fontSize: '14px', fontWeight: '600' as const, padding: '12px 24px', textDecoration: 'none' };
const newsletterBanner = { backgroundColor: '#7c3aed', padding: '20px 24px', margin: '-32px -32px 24px', borderRadius: '0' };
const newsletterTitle = { fontSize: '20px', fontWeight: '700' as const, color: '#ffffff', margin: '0', textAlign: 'center' as const };
const updateBanner = { backgroundColor: '#f4f4f5', padding: '12px 16px', margin: '0 0 16px', borderRadius: '6px' };
const updateLabel = { fontSize: '12px', fontWeight: '600' as const, color: '#7c3aed', margin: '0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
const cardRefBox = { backgroundColor: '#f4f4f5', borderRadius: '6px', padding: '12px 16px', margin: '0 0 8px' };
const cardRefLabel = { fontSize: '11px', color: '#71717a', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
const cardRefLink = { fontSize: '14px', color: '#7c3aed', fontWeight: '500' as const };
