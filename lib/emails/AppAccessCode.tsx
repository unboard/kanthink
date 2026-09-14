import { Text } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface AppAccessCodeProps {
  appTitle: string
  code: string
  /** Minutes the code is good for, so the reader knows whether to hurry. */
  expiresInMinutes: number
}

/**
 * The one-time code that proves an email address belongs to whoever typed it.
 *
 * Deliberately sparse. The code is the entire payload, it needs to survive a
 * preview line on a phone, and anything else in here is something to scroll past
 * while a fifteen-minute timer runs.
 *
 * It also carries the one warning that matters: a code nobody asked for means
 * somebody else is typing this address into that app.
 */
export function AppAccessCode({ appTitle, code, expiresInMinutes }: AppAccessCodeProps) {
  return (
    <BaseLayout previewText={`${code} — your code for ${appTitle}`}>
      <Text style={heading}>Your code for {appTitle}</Text>
      <Text style={codeStyle}>{code}</Text>
      <Text style={paragraph}>
        Enter this to get in. It works for {expiresInMinutes} minutes and once only.
      </Text>
      <Text style={muted}>
        If you did not ask for this, somebody else is entering your email address on that
        app. The code is the only way in, so ignoring this email is enough — nothing has
        been shared with them.
      </Text>
    </BaseLayout>
  )
}

AppAccessCode.PreviewProps = {
  appTitle: 'Cat Math Adventure',
  code: '418290',
  expiresInMinutes: 15,
} satisfies AppAccessCodeProps

export default AppAccessCode

const heading = { fontSize: '18px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 20px' }
const codeStyle = {
  fontSize: '34px',
  fontWeight: '700' as const,
  letterSpacing: '0.18em',
  color: '#18181b',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  margin: '0 0 20px',
  padding: '16px 20px',
  backgroundColor: '#f4f4f5',
  borderRadius: '10px',
  textAlign: 'center' as const,
}
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const muted = { fontSize: '12px', lineHeight: '20px', color: '#a1a1aa', margin: '20px 0 0' }
