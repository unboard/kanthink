import { db } from '@/lib/db'
import { channelActivityLog } from '@/lib/db/schema'
import { ensureSchema } from '@/lib/db/ensure-schema'

type ActivityAction = 'card_created' | 'card_moved' | 'card_deleted' | 'card_updated' | 'task_created' | 'task_completed'
type EntityType = 'card' | 'task'

export async function logChannelActivity(
  channelId: string,
  userId: string,
  action: ActivityAction,
  entityType: EntityType,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await ensureSchema()
    await db.insert(channelActivityLog).values({
      channelId,
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
    })
  } catch (error) {
    // Activity logging is non-critical — never break the main operation
    console.error('[Activity] Failed to log activity:', error)
  }
}
