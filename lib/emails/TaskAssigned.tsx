import { Text, Button } from '@react-email/components'
import { BaseLayout } from './components/BaseLayout'
import * as React from 'react'

interface TaskAssignedProps {
  assignerName: string
  taskTitle: string
  channelName: string
  taskUrl: string
}

export function TaskAssigned({ assignerName, taskTitle, channelName, taskUrl }: TaskAssignedProps) {
  return (
    <BaseLayout previewText={`${assignerName} assigned you a task in "${channelName}"`}>
      <Text style={heading}>Task assigned to you</Text>
      <Text style={paragraph}>
        <strong>{assignerName}</strong> assigned you a task in{' '}
        <strong>&ldquo;{channelName}&rdquo;</strong>:
      </Text>
      <Text style={taskBox}>{taskTitle}</Text>
      <Button href={taskUrl} style={button}>
        View Task
      </Button>
    </BaseLayout>
  )
}

TaskAssigned.PreviewProps = {
  assignerName: 'Carol',
  taskTitle: 'Review Q2 metrics',
  channelName: 'Product Roadmap',
  taskUrl: 'https://kanthink.com/channel/abc/task/123',
} satisfies TaskAssignedProps

export default TaskAssigned

const heading = { fontSize: '20px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 16px' }
const paragraph = { fontSize: '14px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' }
const taskBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  color: '#18181b',
  fontSize: '14px',
  fontWeight: '500' as const,
  margin: '0 0 24px',
  padding: '12px 16px',
}
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block' as const,
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  textDecoration: 'none',
}
