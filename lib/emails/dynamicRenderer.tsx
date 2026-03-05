import { Section, Text, Button, Hr } from '@react-email/components'
import * as React from 'react'
import { BaseLayout } from './components/BaseLayout'

// --- Section types ---

export type EmailSection =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'cta'; text: string; url: string }
  | { type: 'divider' }
  | { type: 'stats'; items: { label: string; value: string; change?: string }[] }
  | { type: 'list'; items: string[]; ordered?: boolean }

export interface EmailContentConfig {
  previewText: string
  subject: string
  sections: EmailSection[]
}

// --- Styles ---

const heading: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#18181b',
  margin: '0 0 12px',
}

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  color: '#3f3f46',
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  margin: '0 0 16px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left' as const,
  fontSize: '12px',
  fontWeight: 600,
  color: '#71717a',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  padding: '8px 12px',
  borderBottom: '2px solid #e4e4e7',
}

const tdStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#3f3f46',
  padding: '8px 12px',
  borderBottom: '1px solid #f4f4f5',
}

const ctaButton: React.CSSProperties = {
  backgroundColor: '#7c3aed',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block' as const,
  fontSize: '14px',
  fontWeight: 600,
  padding: '10px 24px',
  textDecoration: 'none',
  textAlign: 'center' as const,
}

const statCard: React.CSSProperties = {
  backgroundColor: '#fafafa',
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center' as const,
}

const statValue: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#18181b',
  margin: '0',
}

const statLabel: React.CSSProperties = {
  fontSize: '12px',
  color: '#71717a',
  margin: '4px 0 0',
}

const statChange: React.CSSProperties = {
  fontSize: '11px',
  color: '#7c3aed',
  margin: '2px 0 0',
}

const listItem: React.CSSProperties = {
  fontSize: '15px',
  color: '#3f3f46',
  lineHeight: '1.6',
  padding: '2px 0',
}

// --- Section renderers ---

function renderSection(section: EmailSection, index: number): React.ReactNode {
  switch (section.type) {
    case 'heading':
      return <Text key={index} style={heading}>{section.text}</Text>

    case 'paragraph':
      return <Text key={index} style={paragraph}>{section.text}</Text>

    case 'table':
      return (
        <table key={index} cellPadding="0" cellSpacing="0" style={tableStyle}>
          <thead>
            <tr>
              {section.headers.map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={tdStyle}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )

    case 'cta':
      return (
        <Section key={index} style={{ textAlign: 'center' as const, margin: '16px 0' }}>
          <Button href={section.url} style={ctaButton}>{section.text}</Button>
        </Section>
      )

    case 'divider':
      return <Hr key={index} style={{ borderColor: '#e4e4e7', margin: '16px 0' }} />

    case 'stats': {
      const colWidth = `${Math.floor(100 / section.items.length)}%`
      return (
        <table key={index} cellPadding="0" cellSpacing="0" style={{ width: '100%', margin: '0 0 16px' }}>
          <tr>
            {section.items.map((item, i) => (
              <td key={i} style={{ ...statCard, width: colWidth, ...(i < section.items.length - 1 ? { paddingRight: '8px' } : {}) }}>
                <Text style={statValue}>{item.value}</Text>
                <Text style={statLabel}>{item.label}</Text>
                {item.change && <Text style={statChange}>{item.change}</Text>}
              </td>
            ))}
          </tr>
        </table>
      )
    }

    case 'list':
      return (
        <table key={index} cellPadding="0" cellSpacing="0" style={{ width: '100%', margin: '0 0 16px' }}>
          <tbody>
            {section.items.map((item, i) => (
              <tr key={i}>
                <td style={{ width: '24px', verticalAlign: 'top', ...listItem }}>
                  {section.ordered ? `${i + 1}.` : '\u2022'}
                </td>
                <td style={listItem}>{item}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )

    default:
      return null
  }
}

// --- Main component ---

export function DynamicEmail({ config }: { config: EmailContentConfig }) {
  return (
    <BaseLayout previewText={config.previewText}>
      {config.sections.map((section, i) => renderSection(section, i))}
    </BaseLayout>
  )
}
