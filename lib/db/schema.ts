import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// NextAuth required tables
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp' }),
  image: text('image'),

  // Subscription fields
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionId: text('subscription_id'),
  subscriptionStatus: text('subscription_status').$type<'free' | 'active' | 'canceled' | 'past_due'>().default('free'),
  tier: text('tier').$type<'free' | 'premium'>().default('free'),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),

  // BYOK fields
  byokProvider: text('byok_provider').$type<'openai' | 'google' | null>(),
  byokApiKey: text('byok_api_key'),
  byokModel: text('byok_model'),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const accounts = sqliteTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<'oauth' | 'oidc' | 'email'>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
])

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
})

export const verificationTokens = sqliteTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.identifier, table.token] }),
])

// Usage tracking
export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestType: text('request_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// ===== KANBAN DATA TABLES =====

// Channels - main organizational unit
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  status: text('status').$type<'active' | 'paused' | 'archived'>().default('active'),

  // AI settings
  aiInstructions: text('ai_instructions').default(''),
  includeBacksideInAI: integer('include_backside_in_ai', { mode: 'boolean' }).default(false),
  suggestionMode: text('suggestion_mode').$type<'off' | 'manual' | 'daily'>().default('off'),

  // Global help channel (read-only for all users)
  isGlobalHelp: integer('is_global_help', { mode: 'boolean' }).default(false),

  // JSON fields for complex data
  propertyDefinitions: text('property_definitions', { mode: 'json' }).$type<PropertyDefinitionJson[]>(),
  tagDefinitions: text('tag_definitions', { mode: 'json' }).$type<TagDefinitionJson[]>(),
  questions: text('questions', { mode: 'json' }).$type<ChannelQuestionJson[]>(),
  instructionHistory: text('instruction_history', { mode: 'json' }).$type<InstructionRevisionJson[]>(),
  unlinkedTaskOrder: text('unlinked_task_order', { mode: 'json' }).$type<string[]>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channels_owner_idx').on(table.ownerId),
])

// Columns within a channel
export const columns = sqliteTable('columns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  instructions: text('instructions'),
  processingPrompt: text('processing_prompt'),
  autoProcess: integer('auto_process', { mode: 'boolean' }).default(false),
  isAiTarget: integer('is_ai_target', { mode: 'boolean' }).default(false),
  position: integer('position').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('columns_channel_idx').on(table.channelId),
  index('columns_position_idx').on(table.channelId, table.position),
])

// Cards within columns
export const cards = sqliteTable('cards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  columnId: text('column_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),

  title: text('title').notNull(),
  messages: text('messages', { mode: 'json' }).$type<CardMessageJson[]>().default([]),
  coverImageUrl: text('cover_image_url'),
  summary: text('summary'),
  summaryUpdatedAt: integer('summary_updated_at', { mode: 'timestamp' }),
  source: text('source').$type<'manual' | 'ai'>().default('manual'),

  // Card metadata
  properties: text('properties', { mode: 'json' }).$type<CardPropertyJson[]>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),

  // Positioning: position for ordering within column, isArchived for backside
  position: integer('position').notNull().default(0),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),

  // Task visibility preference
  hideCompletedTasks: integer('hide_completed_tasks', { mode: 'boolean' }).default(false),

  // AI tracking
  createdByInstructionId: text('created_by_instruction_id'),
  processedByInstructions: text('processed_by_instructions', { mode: 'json' }).$type<Record<string, string>>(),

  // Spawned channels
  spawnedChannelIds: text('spawned_channel_ids', { mode: 'json' }).$type<string[]>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('cards_channel_idx').on(table.channelId),
  index('cards_column_idx').on(table.columnId),
  index('cards_position_idx').on(table.columnId, table.isArchived, table.position),
])

// Tasks (can be linked to cards or standalone)
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  cardId: text('card_id').references(() => cards.id, { onDelete: 'cascade' }),

  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').$type<'not_started' | 'in_progress' | 'done'>().default('not_started'),

  assignedTo: text('assigned_to'),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),

  position: integer('position').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('tasks_channel_idx').on(table.channelId),
  index('tasks_card_idx').on(table.cardId),
])

// Instruction cards for AI automation
export const instructionCards = sqliteTable('instruction_cards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),

  title: text('title').notNull(),
  instructions: text('instructions').notNull(),
  action: text('action').$type<'generate' | 'modify' | 'move'>().notNull(),
  target: text('target', { mode: 'json' }).$type<InstructionTargetJson>().notNull(),
  contextColumns: text('context_columns', { mode: 'json' }).$type<ContextColumnSelectionJson>(),

  runMode: text('run_mode').$type<'manual' | 'automatic'>().default('manual'),
  cardCount: integer('card_count'),
  interviewQuestions: text('interview_questions', { mode: 'json' }).$type<string[]>(),

  // Automation fields
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(false),
  triggers: text('triggers', { mode: 'json' }).$type<AutomaticTriggerJson[]>(),
  safeguards: text('safeguards', { mode: 'json' }).$type<AutomaticSafeguardsJson>(),

  // Global resource (available to all users, created by admin/Kanthink)
  isGlobalResource: integer('is_global_resource', { mode: 'boolean' }).default(false),

  // Conversational creation/editing history
  conversationHistory: text('conversation_history', { mode: 'json' }).$type<ShroomChatMessageJson[]>(),

  // Multi-step action sequence
  steps: text('steps', { mode: 'json' }).$type<{ action: string; targetColumnId: string; description: string; cardCount?: number }[]>(),

  lastExecutedAt: integer('last_executed_at', { mode: 'timestamp' }),
  nextScheduledRun: integer('next_scheduled_run', { mode: 'timestamp' }),
  dailyExecutionCount: integer('daily_execution_count').default(0),
  dailyCountResetAt: integer('daily_count_reset_at', { mode: 'timestamp' }),
  executionHistory: text('execution_history', { mode: 'json' }).$type<ExecutionRecordJson[]>(),

  position: integer('position').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('instruction_cards_channel_idx').on(table.channelId),
])

// Folders for organizing channels (user-specific)
export const folders = sqliteTable('folders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isCollapsed: integer('is_collapsed', { mode: 'boolean' }).default(false),
  position: integer('position').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('folders_user_idx').on(table.userId),
])

// Per-user channel organization (handles both owned and shared channels)
export const userChannelOrg = sqliteTable('user_channel_org', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  position: integer('position').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('user_channel_org_unique').on(table.userId, table.channelId),
  index('user_channel_org_user_idx').on(table.userId),
  index('user_channel_org_folder_idx').on(table.folderId),
])

// Channel sharing (email invites and active shares)
export const channelShares = sqliteTable('channel_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').$type<'owner' | 'editor' | 'viewer'>().notNull(),

  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: integer('invited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_shares_channel_idx').on(table.channelId),
  index('channel_shares_user_idx').on(table.userId),
  index('channel_shares_email_idx').on(table.email),
  uniqueIndex('channel_shares_channel_user').on(table.channelId, table.userId),
])

// Shareable invite links
export const channelInviteLinks = sqliteTable('channel_invite_links', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  defaultRole: text('default_role').$type<'editor' | 'viewer'>().default('viewer'),
  requiresApproval: integer('requires_approval', { mode: 'boolean' }).default(false),

  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').default(0),

  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_invite_links_channel_idx').on(table.channelId),
  uniqueIndex('channel_invite_links_token').on(table.token),
])

// Instruction run history (for undo functionality)
export const instructionRuns = sqliteTable('instruction_runs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  instructionId: text('instruction_id').notNull().references(() => instructionCards.id, { onDelete: 'cascade' }),
  instructionTitle: text('instruction_title').notNull(),

  changes: text('changes', { mode: 'json' }).$type<CardChangeJson[]>().notNull(),
  undone: integer('undone', { mode: 'boolean' }).default(false),

  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('instruction_runs_channel_idx').on(table.channelId),
  index('instruction_runs_instruction_idx').on(table.instructionId),
])

// ===== JSON TYPE DEFINITIONS =====
// These match the types in lib/types.ts but are for JSON storage

interface PropertyDefinitionJson {
  id: string
  key: string
  label: string
  displayType: 'chip' | 'field'
  allowedValues?: string[]
  color?: string
}

interface TagDefinitionJson {
  id: string
  name: string
  color: string
}

interface ChannelQuestionJson {
  id: string
  question: string
  context: string
  status: 'pending' | 'answered' | 'dismissed'
  answer?: string
  suggestedAnswers?: string[]
  createdAt: string
  answeredAt?: string
}

interface InstructionRevisionJson {
  id: string
  instructions: string
  source: 'user' | 'ai-suggested' | 'ai-auto'
  appliedAt: string
}

interface CardMessageJson {
  id: string
  type: 'note' | 'question' | 'ai_response'
  content: string
  imageUrls?: string[]
  createdAt: string
  replyToMessageId?: string
}

interface CardPropertyJson {
  key: string
  value: string
  displayType: 'chip' | 'field'
  color?: string
}

type InstructionTargetJson =
  | { type: 'column'; columnId: string }
  | { type: 'columns'; columnIds: string[] }
  | { type: 'board' }

type ContextColumnSelectionJson =
  | { type: 'all' }
  | { type: 'columns'; columnIds: string[] }

interface AutomaticSafeguardsJson {
  cooldownMinutes: number
  dailyCap: number
  preventLoops: boolean
}

interface ExecutionRecordJson {
  timestamp: string
  triggeredBy: 'scheduled' | 'event' | 'threshold'
  success: boolean
  cardsAffected: number
}

type AutomaticTriggerJson =
  | { type: 'scheduled'; interval: string; specificTime?: string; dayOfWeek?: number }
  | { type: 'event'; eventType: string; columnId: string }
  | { type: 'threshold'; columnId: string; operator: string; threshold: number }

interface CardChangeJson {
  cardId: string
  type: 'task_added' | 'property_set' | 'title_changed' | 'message_added' | 'tag_added'
  taskId?: string
  previousTitle?: string
  propertyKey?: string
  previousValue?: string
  messageId?: string
  tagName?: string
}

interface ShroomChatMessageJson {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ===== TYPE EXPORTS =====
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UsageRecord = typeof usageRecords.$inferSelect

export type DbChannel = typeof channels.$inferSelect
export type NewDbChannel = typeof channels.$inferInsert
export type DbColumn = typeof columns.$inferSelect
export type NewDbColumn = typeof columns.$inferInsert
export type DbCard = typeof cards.$inferSelect
export type NewDbCard = typeof cards.$inferInsert
export type DbTask = typeof tasks.$inferSelect
export type NewDbTask = typeof tasks.$inferInsert
export type DbInstructionCard = typeof instructionCards.$inferSelect
export type NewDbInstructionCard = typeof instructionCards.$inferInsert
export type DbFolder = typeof folders.$inferSelect
export type NewDbFolder = typeof folders.$inferInsert
export type DbUserChannelOrg = typeof userChannelOrg.$inferSelect
export type NewDbUserChannelOrg = typeof userChannelOrg.$inferInsert
export type DbChannelShare = typeof channelShares.$inferSelect
export type NewDbChannelShare = typeof channelShares.$inferInsert
export type DbChannelInviteLink = typeof channelInviteLinks.$inferSelect
export type NewDbChannelInviteLink = typeof channelInviteLinks.$inferInsert
export type DbInstructionRun = typeof instructionRuns.$inferSelect
export type NewDbInstructionRun = typeof instructionRuns.$inferInsert
