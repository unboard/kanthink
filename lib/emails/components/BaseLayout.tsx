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

export interface DesignTokens {
  accentColor: string
  headerBg: string
  bodyBg: string
  containerBg: string
  footerBg: string
  ctaColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  contentPadding: string
  fontStack: string
}

export const DEFAULT_TOKENS: DesignTokens = {
  accentColor: '#7c3aed',
  headerBg: '#18181b',
  bodyBg: '#f4f4f5',
  containerBg: '#ffffff',
  footerBg: '#fafafa',
  ctaColor: '#7c3aed',
  textColor: '#3f3f46',
  mutedColor: '#71717a',
  borderColor: '#e4e4e7',
  contentPadding: '32px',
  fontStack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

interface BaseLayoutProps {
  previewText: string
  tokens?: Partial<DesignTokens>
  children: React.ReactNode
}

export function BaseLayout({ previewText, tokens, children }: BaseLayoutProps) {
  const t: DesignTokens = { ...DEFAULT_TOKENS, ...tokens }

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{
        backgroundColor: t.bodyBg,
        fontFamily: t.fontStack,
        margin: '0',
        padding: '0',
      }}>
        <Container style={{
          backgroundColor: t.containerBg,
          borderRadius: '8px',
          margin: '40px auto',
          maxWidth: '480px',
          padding: '0',
          overflow: 'hidden' as const,
        }}>
          {/* Violet accent bar */}
          <Section style={{
            backgroundColor: t.accentColor,
            height: '4px',
            margin: '0',
            padding: '0',
          }} />

          {/* Header with logo */}
          <Section style={{
            backgroundColor: t.headerBg,
            padding: '24px 32px',
            textAlign: 'center' as const,
          }}>
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
                  <Text style={{
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: '700' as const,
                    margin: '0',
                    lineHeight: '32px',
                  }}>Kanthink</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Content */}
          <Section style={{ padding: t.contentPadding }}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={{
            backgroundColor: t.footerBg,
            borderTop: `1px solid ${t.borderColor}`,
            padding: '24px 32px',
          }}>
            <Section style={{ textAlign: 'center' as const }}>
              <Button href="https://kanthink.com" style={{
                backgroundColor: t.ctaColor,
                borderRadius: '6px',
                color: '#ffffff',
                display: 'inline-block' as const,
                fontSize: '14px',
                fontWeight: '600' as const,
                padding: '10px 24px',
                textDecoration: 'none',
                textAlign: 'center' as const,
              }}>
                Go to Kanthink
              </Button>
            </Section>
            <Text style={{
              color: t.mutedColor,
              fontSize: '12px',
              margin: '16px 0 0',
              textAlign: 'center' as const,
            }}>
              AI-driven Kanban for clarity
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
