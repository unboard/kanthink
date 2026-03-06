import { Text, Button, Hr } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface ActivityItem {
  action: string
  entityType: string
  metadata?: Record<string, unknown>
  createdAt: string
}

interface ChannelDigestProps {
  channelName: string
  userName: string
  periodLabel: string
  aiSummary: string | null
  activities: ActivityItem[]
  channelUrl: string
}

const ACTION_LABELS: Record<string, string> = {
  card_created: 'New card created',
  card_moved: 'Card moved',
  card_deleted: 'Card deleted',
  card_updated: 'Card updated',
  task_created: 'New task created',
  task_completed: 'Task completed',
}

export function ChannelDigest({
  channelName,
  userName,
  periodLabel,
  aiSummary,
  activities,
  channelUrl,
}: ChannelDigestProps) {
  return (
    <BaseLayout previewText={`Your ${periodLabel} digest for "${channelName}"`}>
      <Text style={heading}>Your {periodLabel} digest for &ldquo;{channelName}&rdquo;</Text>
      <Text style={greeting}>Hi {userName},</Text>

      {aiSummary && (
        <>
          <Text style={summaryBox}>{aiSummary}</Text>
          <Hr style={divider} />
        </>
      )}

      <Text style={sectionLabel}>Activity ({activities.length} events)</Text>
      {activities.slice(0, 20).map((activity, i) => (
        <Text key={i} style={activityLine}>
          {ACTION_LABELS[activity.action] || activity.action}
          {activity.metadata?.title ? `: ${activity.metadata.title}` : ''}
        </Text>
      ))}
      {activities.length > 20 && (
        <Text style={moreText}>...and {activities.length - 20} more</Text>
      )}

      <Button href={channelUrl} style={button}>
        Open Channel
      </Button>
    </BaseLayout>
  )
}

ChannelDigest.PreviewProps = {
  channelName: 'Product Roadmap',
  userName: 'Dave',
  periodLabel: 'weekly',
  aiSummary: 'This week saw 5 new cards added to the backlog and 3 tasks completed. The team focused on refining the Q2 goals column.',
  activities: [
    { action: 'card_created', entityType: 'card', metadata: { title: 'Add dark mode' }, createdAt: '2026-03-01T10:00:00Z' },
    { action: 'task_completed', entityType: 'task', metadata: { title: 'Review metrics' }, createdAt: '2026-03-02T14:00:00Z' },
    { action: 'card_moved', entityType: 'card', metadata: { title: 'Fix login bug' }, createdAt: '2026-03-03T09:00:00Z' },
  ],
  channelUrl: 'https://kanthink.com/channel/abc',
} satisfies ChannelDigestProps

export default ChannelDigest

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 8px' }
const greeting = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const summaryBox = {
  backgroundColor: '#f4f4f5',
  borderLeft: '3px solid #7c3aed',
  borderRadius: '4px',
  color: '#3f3f46',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 16px',
  padding: '12px 16px',
}
const divider = { borderColor: '#e4e4e7', margin: '16px 0' }
const sectionLabel = { fontSize: '12px', fontWeight: '600' as const, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 8px' }
const activityLine = { fontSize: '13px', lineHeight: '20px', color: '#3f3f46', margin: '0 0 4px', paddingLeft: '8px' }
const moreText = { fontSize: '13px', color: '#71717a', margin: '4px 0 16px', paddingLeft: '8px' }
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block' as const,
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  textDecoration: 'none',
  marginTop: '16px',
}
