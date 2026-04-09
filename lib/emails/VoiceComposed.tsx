import { Text, Button, Hr, Link, Section, Heading, Img } from '@react-email/components'
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

/** Parse inline markdown (**bold**, *italic*, [links](url)) into React elements */
function parseInline(text: string, key: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
  let match;
  let lastIndex = 0;
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) parts.push(remaining.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={`${key}-b${idx++}`}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={`${key}-i${idx++}`}>{match[2]}</em>);
    else if (match[3] && match[4]) parts.push(<Link key={`${key}-l${idx++}`} href={match[4]} style={{ color: '#7c3aed', textDecoration: 'underline' }}>{match[3]}</Link>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

function parseBody(body: string): React.ReactNode[] {
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={i} />;
    // Inline image: ![alt](url)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      return <Img key={i} src={imgMatch[2]} alt={imgMatch[1] || 'Image'} width="480" style={{ display: 'block', maxWidth: '100%', margin: '8px 0', borderRadius: '6px' }} />;
    }
    // Headers
    if (trimmed.startsWith('## ')) return <Heading key={i} as="h2" style={h2Style}>{parseInline(trimmed.slice(3), `h${i}`)}</Heading>;
    if (trimmed.startsWith('# ')) return <Heading key={i} as="h1" style={h1Style}>{parseInline(trimmed.slice(2), `h${i}`)}</Heading>;
    // Bullet items
    if (trimmed.startsWith('- ') || trimmed.startsWith('• '))
      return <Text key={i} style={bulletStyle}>• {parseInline(trimmed.slice(2), `b${i}`)}</Text>;
    // Numbered items
    if (/^\d+\.\s/.test(trimmed)) {
      const numEnd = trimmed.indexOf('. ') + 2;
      return <Text key={i} style={bulletStyle}>{trimmed.slice(0, numEnd)}{parseInline(trimmed.slice(numEnd), `n${i}`)}</Text>;
    }
    // Blockquote
    if (trimmed.startsWith('> '))
      return <Text key={i} style={quoteStyle}>{parseInline(trimmed.slice(2), `q${i}`)}</Text>;
    // Regular paragraph
    return <Text key={i} style={paragraphStyle}>{parseInline(trimmed, `p${i}`)}</Text>;
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
