// All notification types in the system
export type NotificationType =
  // Collaboration
  | 'card_assigned'
  | 'task_assigned'
  | 'mentioned_in_card'
  | 'channel_shared'
  | 'channel_join_via_link'
  // AI / Shrooms
  | 'shroom_completed'
  | 'ai_generation_completed'
  | 'ai_instruction_refinement'
  | 'ai_clarifying_questions'
  | 'drift_detected'
  // Automation
  | 'automation_completed'
  | 'threshold_fired'
  | 'safeguard_tripped'
  // Board Activity
  | 'card_added_by_other'
  | 'card_moved_by_other'

export type NotificationCategory = 'collaboration' | 'ai' | 'automation' | 'board_activity'

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, { label: string; types: NotificationType[] }> = {
  collaboration: {
    label: 'Collaboration',
    types: ['card_assigned', 'task_assigned', 'mentioned_in_card', 'channel_shared', 'channel_join_via_link'],
  },
  ai: {
    label: 'AI & Shrooms',
    types: ['shroom_completed', 'ai_generation_completed', 'ai_instruction_refinement', 'ai_clarifying_questions', 'drift_detected'],
  },
  automation: {
    label: 'Automation',
    types: ['automation_completed', 'threshold_fired', 'safeguard_tripped'],
  },
  board_activity: {
    label: 'Board Activity',
    types: ['card_added_by_other', 'card_moved_by_other'],
  },
}

export function getCategoryForType(type: NotificationType): NotificationCategory {
  for (const [category, config] of Object.entries(NOTIFICATION_CATEGORIES)) {
    if (config.types.includes(type)) {
      return category as NotificationCategory
    }
  }
  return 'board_activity'
}

export interface NotificationData {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown> | null
  isRead: boolean
  createdAt: string
  readAt: string | null
}
