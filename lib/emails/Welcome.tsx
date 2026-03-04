import { Text, Link } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface WelcomeProps {
  userName: string
}

export function Welcome({ userName }: WelcomeProps) {
  const name = userName || 'there'
  return (
    <BaseLayout previewText={`Welcome to Kanthink, ${name}!`}>
      <Text style={heading}>Welcome to Kanthink!</Text>
      <Text style={paragraph}>
        Hi {name}, thanks for joining. Kanthink is an AI-driven Kanban tool
        that helps you organize, clarify, and evolve your ideas.
      </Text>
      <Text style={paragraph}>
        Create your first channel and let Kan help you get started.
      </Text>
      <Text style={muted}>
        Questions? Just reply to this email.
      </Text>
    </BaseLayout>
  )
}

Welcome.PreviewProps = {
  userName: 'Alice',
} satisfies WelcomeProps

export default Welcome

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const muted = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0' }
