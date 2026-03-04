import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Preview,
  Img,
  Button,
} from '@react-email/components'
import * as React from 'react'

interface BaseLayoutProps {
  previewText: string
  children: React.ReactNode
}

export function BaseLayout({ previewText, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Violet accent bar */}
          <Section style={accentBar} />

          {/* Header with logo */}
          <Section style={header}>
            <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
              <tr>
                <td style={{ verticalAlign: 'middle', paddingRight: '10px' }}>
                  <Img
                    src="https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_64,h_64/v1769532115/kanthink-icon_pbne7q.svg"
                    width="32"
                    height="32"
                    alt="Kan"
                    style={{ display: 'block' }}
                  />
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <Text style={logoText}>Kanthink</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Content */}
          <Section style={content}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Section style={{ textAlign: 'center' as const }}>
              <Button href="https://kanthink.com" style={footerButton}>
                Go to Kanthink
              </Button>
            </Section>
            <Text style={tagline}>
              AI-driven Kanban for clarity
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const body = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: '0',
  padding: '0',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  margin: '40px auto',
  maxWidth: '480px',
  padding: '0',
  overflow: 'hidden' as const,
}

const accentBar = {
  backgroundColor: '#7c3aed',
  height: '4px',
  margin: '0',
  padding: '0',
}

const header = {
  backgroundColor: '#18181b',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const logoText = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700' as const,
  margin: '0',
  lineHeight: '32px',
}

const content = {
  padding: '32px',
}

const footer = {
  backgroundColor: '#fafafa',
  borderTop: '1px solid #e4e4e7',
  padding: '24px 32px',
}

const footerButton = {
  backgroundColor: '#7c3aed',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block' as const,
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '10px 24px',
  textDecoration: 'none',
  textAlign: 'center' as const,
}

const tagline = {
  color: '#a1a1aa',
  fontSize: '12px',
  margin: '16px 0 0',
  textAlign: 'center' as const,
}
