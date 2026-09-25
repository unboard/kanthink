import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, customType } from 'drizzle-orm/sqlite-core'

/**
 * Like text({ mode: 'json' }) but catches JSON.parse errors instead of crashing.
 * Returns the provided fallback value when the stored text is not valid JSON.
 */
const safeJsonText = <T>(fallback: T) => customType<{ data: T; driverData: string }>({
  dataType() { return 'text' },
  toDriver(value: T): string {
    return JSON.stringify(value)
  },
  fromDriver(value: string): T {
    if (value == null || value === '') return fallback
    try { return JSON.parse(value) as T }
    catch { return fallback }
  },
})

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

  // BYOK fields.
  //
  // These three are the single-key era: one provider, one key, one model. They are
  // still read, because accounts configured before this still hold their key here,
  // and resolveProviderKeys folds whichever provider they chose into the matching
  // column below. Nothing writes them any more.
  byokProvider: text('byok_provider').$type<'openai' | 'google' | null>(),
  byokApiKey: text('byok_api_key'),
  byokModel: text('byok_model'),

  // One key per provider, encrypted, held at the same time. Having both is the
  // point: a model choice stops being constrained by which single key you saved.
  openaiApiKey: text('openai_api_key'),
  googleApiKey: text('google_api_key'),
  anthropicApiKey: text('anthropic_api_key'),

  /**
   * The model almost everything runs on, provider-qualified ("google:gemini-3.8-flash").
   * NULL means the provider default for whichever key is configured.
   */
  modelDefault: text('model_default'),
  /**
   * Per-area exceptions to that, as { surface: choice }. Empty for most accounts,
   * and deliberately so — see lib/ai/modelPreferences: the default is the setting,
   * and these exist for the one area where somebody wants something different.
   */
  modelOverrides: text('model_overrides', { mode: 'json' }).$type<Record<string, string>>(),
  /**
   * The image model Kan draws with, provider-qualified ("openai:gpt-image-2.5-flare").
   * Separate from modelDefault because a text model cannot make a picture — one
   * setting covering both would be a choice that silently does nothing half the time.
   * NULL means the catalogue default; see lib/ai/imageModels.
   */
  imageModelDefault: text('image_model_default'),

  // Agent seats. An 'agent' row is a real identity — its own name, avatar, session
  // and channel shares — but it owns no commercial relationship. Tier, BYOK and
  // quota all resolve through parentUserId; see resolveBillingUserId() in lib/usage.ts.
  // This is deliberately not "copy the parent's key onto the agent row": the key
  // stays on exactly one row, so rotating or revoking it is still a single edit.
  kind: text('kind').$type<'human' | 'agent'>().default('human'),
  parentUserId: text('parent_user_id'),

  // Where the share sheet / bookmarklet drops things by default. Stored per user
  // rather than in localStorage so the default is the same from the phone and the
  // desktop browser. Null falls back to the Kan Bookmarks inbox.
  saveDefaultChannelId: text('save_default_channel_id'),
  saveDefaultColumnId: text('save_default_column_id'),

  // The publisher's side of the app directory.
  /** Account-level house style for app thumbnails — what makes a set of them look related. */
  appImagePrompt: text('app_image_prompt'),
  /**
   * Ceiling across every app this account publishes, in cents, per window.
   *
   * The backstop that per-app limits cannot defeat: twenty apps each under their own
   * limit can still add up to a bill nobody agreed to.
   */
  appAiSpendLimitCents: integer('app_ai_spend_limit_cents'),
  /** Default ceiling applied to an app that has not set its own. */
  appAiDefaultLimitCents: integer('app_ai_default_limit_cents'),
  /** Vanity segment for the public app page at /apps/u/<slug>. */
  appPageSlug: text('app_page_slug'),
  appPageTitle: text('app_page_title'),
  appPageBio: text('app_page_bio'),
  appPagePublic: integer('app_page_public', { mode: 'boolean' }).default(false),

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

  // Quick Save channel (one per user, auto-created)
  isQuickSave: integer('is_quick_save', { mode: 'boolean' }).default(false),

  // Cover image
  coverImageUrl: text('cover_image_url'),

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

// Data source connections for channels (e.g. Mixpanel, Amplitude)
export const channelDataSources = sqliteTable('channel_data_sources', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'mixpanel', 'amplitude', etc.
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: integer('token_expires_at'), // epoch seconds
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(), // provider-specific config (project id, region, etc.)
  status: text('status').$type<'active' | 'expired' | 'disconnected'>().default('active'),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_data_sources_channel_idx').on(table.channelId),
  index('channel_data_sources_provider_idx').on(table.channelId, table.provider),
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

  // Sticky sort preference. 'manual' (the default) means positions are whatever
  // the user dragged them to. Anything else is a rule new cards have to respect,
  // so a shared bookmark doesn't land at the bottom of a newest-first column.
  sortOrder: text('sort_order').$type<'manual' | 'created_newest' | 'created_oldest' | 'updated_newest' | 'updated_oldest'>().default('manual'),

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

  // Assignment
  assignedTo: text('assigned_to', { mode: 'json' }).$type<string[]>(),

  // Positioning: position for ordering within column, isArchived for backside
  position: integer('position').notNull().default(0),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),

  // Pending review: AI-generated cards awaiting approval. A third position bucket
  // alongside active and archived — see lib/db/cardBuckets.ts.
  isPendingReview: integer('is_pending_review', { mode: 'boolean' }).default(false),
  reviewRunId: text('review_run_id'),  // groups cards produced by one shroom run

  // Task visibility preference
  hideCompletedTasks: integer('hide_completed_tasks', { mode: 'boolean' }).default(false),

  // Agent processing state (persisted so it survives page reload)
  isProcessing: integer('is_processing', { mode: 'boolean' }).default(false),
  processingStatus: text('processing_status'),

  // AI tracking
  createdByInstructionId: text('created_by_instruction_id'),
  processedByInstructions: text('processed_by_instructions', { mode: 'json' }).$type<Record<string, string>>(),

  // Spawned channels
  spawnedChannelIds: text('spawned_channel_ids', { mode: 'json' }).$type<string[]>(),

  // Public sharing
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  shareToken: text('share_token'),
  shareTheme: text('share_theme').default('conversational'),

  // Snooze
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp' }),

  // Visual
  color: text('color'),  // Left border color: 'red', 'blue', 'green', etc.

  // Pinning
  pinnedAt: integer('pinned_at', { mode: 'timestamp' }),

  // Card-level reactions
  reactions: text('reactions', { mode: 'json' }).$type<{ emoji: string; userIds: string[] }[]>(),

  // Widget card type system
  cardType: text('card_type'),  // null = standard, 'calendar', 'poll', etc.
  typeData: text('type_data', { mode: 'json' }),  // type-specific configuration

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('cards_channel_idx').on(table.channelId),
  index('cards_column_idx').on(table.columnId),
  index('cards_position_idx').on(table.columnId, table.isArchived, table.position),
  index('cards_review_idx').on(table.columnId, table.isPendingReview),
])

// Tasks (can be linked to cards or standalone)
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  cardId: text('card_id').references(() => cards.id, { onDelete: 'cascade' }),
  columnId: text('column_id'),        // Which column this standalone task lives in (null = card-owned)

  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').$type<'not_started' | 'in_progress' | 'on_hold' | 'done'>().default('not_started'),

  assignedTo: text('assigned_to', { mode: 'json' }).$type<string[]>(),
  notes: safeJsonText<TaskNoteJson[]>([])('notes').default([]),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),

  createdBy: text('created_by'),
  position: integer('position').notNull().default(0),

  // Snooze
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp' }),

  // Archive
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('tasks_channel_idx').on(table.channelId),
  index('tasks_card_idx').on(table.cardId),
  index('tasks_column_idx').on(table.columnId),
])

/**
 * Playground apps — generated single-file React apps that hang off a card.
 *
 * An app is an artifact of its source card, the way a task is: many per card,
 * listed under the tasks, each opening its own drawer. The card supplies the
 * brief for the first build and stays linked from the top of the app's thread;
 * after that the app owns its own conversation and its own code.
 *
 * This replaced the older model where a playground WAS a card
 * (`cards.cardType = 'playground'`, code in `cards.typeData`), which capped a
 * card at one app and made the card's thread do double duty as build log and
 * discussion. Those cards' data is still on disk but nothing reads it.
 */
export const playgroundApps = sqliteTable('playground_apps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  // The card this app is an artifact of. Deleting the card takes its apps with it.
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),

  title: text('title').notNull().default('New app'),
  summary: text('summary'),

  // --- The build ---
  code: text('code'),
  generationCount: integer('generation_count').notNull().default(0),
  /** Running list of established design decisions, re-injected on every iteration. */
  designNotes: text('design_notes'),
  /**
   * What this app must do, carried forward on every build.
   *
   * Separate from designNotes, which records how it looks and how it was put
   * together. This is the contract: the things that have to stay true however the
   * code is rearranged.
   *
   * It exists because a thread is a window. The builder sees the last forty
   * messages and preflight the last fourteen, so a requirement stated early stops
   * being visible long before it stops mattering — which is why people end up
   * saying the same thing three times, each time a little less politely.
   */
  requirements: text('requirements'),
  /**
   * The app as it stood immediately before the most recent build.
   *
   * Releases are the deliberate history: you publish, and that version is kept. But
   * a build overwrites the draft in place, and until you have published even once
   * there is no history at all — so a single mis-aimed click could destroy work with
   * nothing to go back to. One step of undo, written before every build, costs one
   * column and removes that cliff.
   *
   * Deeper history is still what publishing is for.
   */
  previousBuild: text('previous_build', { mode: 'json' }).$type<{
    code: string
    designNotes?: string | null
    requirements?: string | null
    notes?: string | null
    dependencies?: string[] | null
    generationCount: number
    savedAt: string
  } | null>(),
  /** Kan's notes from the most recent build, shown under the preview. */
  lastNotes: text('last_notes'),
  /**
   * Runtime dependency declarations in lib/playground/runtime grammar, as declared
   * by the model. Stored as declarations rather than resolved URLs so resolution
   * rules can change without rewriting rows — always re-resolved via resolveDeps.
   */
  dependencies: safeJsonText<string[]>([])('dependencies').default([]),

  // --- Model + cost ---
  lastModelId: text('last_model_id'),
  lastUsage: text('last_usage', { mode: 'json' }).$type<PlaygroundUsageJson | null>(),
  /** Sticky per-app model choice; falls back to the 'auto' router when null. */
  modelId: text('model_id'),

  // --- Thread ---
  // Same message shape as a card thread, so the chat components are shared.
  messages: safeJsonText<CardMessageJson[]>([])('messages').default([]),

  // --- Directory ---
  /**
   * The app's face in the directory. Generated on demand rather than on build:
   * an image costs money and most apps are iterated on a dozen times before
   * anyone would want a picture of them.
   */
  thumbnailUrl: text('thumbnail_url'),
  /** The brief that produced the current thumbnail, so "regenerate" can reuse it. */
  thumbnailPrompt: text('thumbnail_prompt'),
  /** 'none' | 'pending' | 'ready' | 'failed'. Drives the directory's placeholder state. */
  thumbnailStatus: text('thumbnail_status').$type<'none' | 'pending' | 'ready' | 'failed'>().default('none'),
  /** One line the owner writes for the directory and the public page. */
  tagline: text('tagline'),
  /** Public apps are listed on the owner's public app page unless this is off. */
  listedInDirectory: integer('listed_in_directory', { mode: 'boolean' }).default(true),
  /** Opens of the public /play link. Cheap counter, not analytics. */
  viewCount: integer('view_count').notNull().default(0),

  // --- AI spending ---
  //
  // A published app's AI calls are billed to whoever published it, and until this
  // existed there was no ceiling at all: an AI-flavoured app shared somewhere busy
  // spent the owner's money once per visitor, uncapped.
  //
  // Null means "use the account default", which is itself finite. There is no
  // setting anywhere that means unlimited.
  /** Ceiling for this app, in cents, per window. */
  aiSpendLimitCents: integer('ai_spend_limit_cents'),
  /** Ceiling per identified customer, in cents, per window. */
  aiCustomerLimitCents: integer('ai_customer_limit_cents'),

  // --- Paywall ---
  // A published app can charge. The price lives on Stripe; these columns are the
  // local handle on it, so flipping the paywall off never destroys the product.
  paywallEnabled: integer('paywall_enabled', { mode: 'boolean' }).default(false),
  /**
   * Where the gate sits.
   *
   * 'app' — the door. Nobody unpaid ever receives the code, which is the strongest
   * thing this can be and the right default for something whose whole value is the
   * thing itself.
   *
   * 'action' — inside. Everyone gets in and the app decides what costs money, via
   * window.kanthinkPay. The code ships to everyone, so the gate is only as honest
   * as the server behind it: entitlement is re-checked on /api/playground/ai, which
   * is the one capability an unpaid visitor could otherwise spend real money on.
   */
  paywallMode: text('paywall_mode').$type<'app' | 'action'>().default('app'),
  /** Minor units (cents). Null until a price is set. */
  priceAmount: integer('price_amount'),
  priceCurrency: text('price_currency').default('usd'),
  /** 'one_time' | 'month' | 'year' — what the buyer is agreeing to. */
  priceInterval: text('price_interval').$type<'one_time' | 'month' | 'year'>(),
  stripeProductId: text('stripe_product_id'),
  stripePriceId: text('stripe_price_id'),

  // --- Draft and published ---
  //
  // `code` above is the DRAFT. It is what a build writes and what the owner
  // previews, and customers never see it. What they get is the version row this
  // points at, which only moves when somebody publishes.
  //
  // Before this existed a build went straight to whoever was using the app, so
  // iterating on something you had sold meant rewriting it under its customers.
  publishedVersionId: text('published_version_id'),
  /**
   * Records written by the app while being previewed as a draft.
   *
   * A draft preview runs the same generated code against the same helpers, so
   * without somewhere else to put them, testing a save would overwrite what real
   * customers had stored. Never read by the public page, and never promoted.
   */
  draftSavedRecords: safeJsonText<SavedRecordJson[]>([])('draft_saved_records').default([]),

  // --- Sharing ---
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  shareToken: text('share_token'),
  /** Signed HMAC the sandboxed iframe uses to call back into /api/playground/ai. */
  appToken: text('app_token'),
  /** Records the running app persisted via window.kanthinkSave. */
  savedRecords: safeJsonText<SavedRecordJson[]>([])('saved_records').default([]),

  position: integer('position').notNull().default(0),
  createdBy: text('created_by'),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('playground_apps_card_idx').on(table.cardId),
  index('playground_apps_channel_idx').on(table.channelId),
  index('playground_apps_share_idx').on(table.shareToken),
])

/**
 * A published release of an app.
 *
 * Immutable once written: publishing appends, it never edits. That is what makes
 * rollback a pointer move rather than a restore, and what lets a customer keep
 * using the thing they paid for while the next version is being argued with.
 *
 * Only what is needed to SERVE a version lives here. Purchases, feedback and saved
 * records hang off the app, not the release, so publishing and rolling back cannot
 * disturb them — the separation is the guarantee, not a rule anyone has to follow.
 */
export const playgroundAppVersions = sqliteTable('playground_app_versions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),

  /** 1, 2, 3… per app. What the owner and the changelog call it. */
  version: integer('version').notNull(),

  code: text('code').notNull(),
  dependencies: safeJsonText<string[]>([])('dependencies').default([]),
  title: text('title').notNull(),
  summary: text('summary'),
  designNotes: text('design_notes'),
  /** What changed in this release, for the history list. */
  notes: text('notes'),
  /** The build this was cut from, so a release can be traced to its generation. */
  sourceGeneration: integer('source_generation'),
  modelId: text('model_id'),

  publishedAt: integer('published_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  publishedBy: text('published_by'),
}, (table) => [
  index('playground_app_versions_app_idx').on(table.appId, table.version),
])

/**
 * Someone who uses a published app.
 *
 * Deliberately not a Kanthink account. A buyer of a $4 app should not have to make
 * a board to open the thing they bought, so identity here is an email plus a signed
 * access token in a cookie — see lib/playground/appAccess. If that email already
 * belongs to a Kanthink user, userId links the two and the publisher's replies reach
 * them through the normal notification path as well as through the app.
 */
export const appUsers = sqliteTable('app_users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),
  /** The publisher. Denormalised so "everyone across all my apps" is one query. */
  ownerId: text('owner_id').notNull(),

  email: text('email').notNull(),
  name: text('name'),
  /** Set when the email matches a Kanthink account. */
  userId: text('user_id'),

  /**
   * A roll-up of this person's purchases, kept for the publisher's list and the
   * directory counts. DERIVED — recomputed whenever a purchase changes, and never
   * the thing an access decision reads.
   *
   * It used to be the whole story, which is why two purchases on one address
   * collided: the second overwrote the first's identifiers, and refunding either
   * one revoked both. Purchases live in app_purchases now, one row each.
   */
  status: text('status').$type<'free' | 'paid' | 'refunded' | 'canceled'>().notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  /** Minor units actually charged, kept even if the app's price later changes. */
  amountPaid: integer('amount_paid'),
  currency: text('currency'),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  /** For subscriptions: when the current period runs out. Null for one-time buys. */
  accessExpiresAt: integer('access_expires_at', { mode: 'timestamp' }),

  /** Usage, as much as a static page can honestly report: opens and last seen. */
  sessionCount: integer('session_count').notNull().default(0),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  /** Unread messages from this person, for the publisher's badge. */
  unreadForOwner: integer('unread_for_owner').notNull().default(0),

  // --- Proof that this email belongs to whoever is holding the cookie ---
  //
  // Access used to be granted on a typed email alone, which meant knowing a
  // customer's address was the same as being them: their paid access, and their
  // support thread. Nothing is granted now until the address is proved, and every
  // grant issued before this existed reads as unverified and has to be proved once.
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  /**
   * Bumping this invalidates every outstanding session for this person.
   *
   * Sessions are signed over it, so revocation is a single increment rather than a
   * secret rotation that would sign out every customer of every app.
   */
  sessionEpoch: integer('session_epoch').notNull().default(0),
  /** HMAC of the outstanding one-time code. The code itself is never stored. */
  verificationCodeHash: text('verification_code_hash'),
  verificationExpiresAt: integer('verification_expires_at', { mode: 'timestamp' }),
  /** Wrong guesses against the current code. Burns the code when it runs out. */
  verificationAttempts: integer('verification_attempts').notNull().default(0),
  /** When the last code went out, so codes cannot be used to mailbomb someone. */
  verificationSentAt: integer('verification_sent_at', { mode: 'timestamp' }),
  /** Codes sent in the current window, for the same reason. */
  verificationSendCount: integer('verification_send_count').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('app_users_app_email_idx').on(table.appId, table.email),
  index('app_users_app_idx').on(table.appId),
  index('app_users_owner_idx').on(table.ownerId),
  index('app_users_user_idx').on(table.userId),
])

/**
 * What one customer has saved in one app.
 *
 * The thing a published app was missing. Generated apps had localStorage, which the
 * sandbox does not really give them — the host keeps a copy per browser — so a
 * person's work lived on one device and vanished if they cleared the site. An app
 * that tells someone their progress is saved when it is only cached is worse than
 * one that never claimed to save at all.
 *
 * Rows are addressed by (app, customer, scope, key) and nothing else. Notably NOT
 * by release: publishing a new version of an app changes the code customers run and
 * leaves every one of these rows exactly where it was.
 *
 * Ownership is enforced on the server. The key a request may write is derived from
 * the session it arrives with, never from anything the app sends, so a page cannot
 * ask for somebody else's row by naming it.
 */
export const appCustomerData = sqliteTable('app_customer_data', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),
  appUserId: text('app_user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),

  /**
   * 'live' for the published app; 'draft' for the owner previewing a build.
   *
   * Separate namespaces, because an owner checking that saving works should not be
   * writing over what their customers have stored.
   */
  scope: text('scope').$type<'live' | 'draft'>().notNull().default('live'),

  /** The app's own name for this piece of data. */
  key: text('key').notNull(),
  /** JSON, as text. Shape is the app's business. */
  value: text('value').notNull(),
  /** Byte length of value, so a customer's total is a sum rather than a scan. */
  bytes: integer('bytes').notNull().default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('app_customer_data_key_idx').on(table.appId, table.appUserId, table.scope, table.key),
  index('app_customer_data_member_idx').on(table.appUserId, table.scope),
])

/**
 * The conversation between one app user and the app's publisher.
 *
 * One thread per (app, person). A published app has a Feedback button; what arrives
 * lands here, and the publisher answers from the app's Audience tab. Turning a
 * complaint into a fix is a button on that thread — it posts the message into the
 * app's own build thread, which is where the generator reads its brief from.
 */
export const appMessages = sqliteTable('app_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),
  appUserId: text('app_user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  /** 'user' — from the person using the app; 'publisher' — the reply. */
  sender: text('sender').$type<'user' | 'publisher'>().notNull(),
  body: text('body').notNull(),
  /** Read by the other side. */
  isRead: integer('is_read', { mode: 'boolean' }).default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('app_messages_app_idx').on(table.appId, table.createdAt),
  index('app_messages_thread_idx').on(table.appUserId, table.createdAt),
])

/**
 * One purchase of one app.
 *
 * Separate from the person who made it, because those are different things and
 * conflating them was a billing defect: two purchases against the same email shared
 * a row, so the second overwrote the first's subscription id — leaving a live Stripe
 * subscription nothing in Kanthink could cancel — and refunding either one revoked
 * access for both.
 *
 * Each purchase now carries its own identifiers, its own status, and its own expiry.
 * A refund touches one row. A session granted by a purchase names that purchase, so
 * it cannot inherit access from a sibling that happens to share an address.
 */
export const appPurchases = sqliteTable('app_purchases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),
  /** The identity it was bought against. Several purchases may share one. */
  appUserId: text('app_user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),

  /** 'active' — grants access; the rest are ways it stopped doing so. */
  status: text('status').$type<'active' | 'refunded' | 'canceled' | 'expired'>().notNull().default('active'),

  /**
   * The checkout session that created it. Unique, and the reason a webhook
   * delivered three times produces one purchase rather than three.
   */
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),

  /** Minor units actually charged, kept even if the app's price later changes. */
  amount: integer('amount'),
  currency: text('currency'),
  interval: text('interval').$type<'one_time' | 'month' | 'year'>(),

  paidAt: integer('paid_at', { mode: 'timestamp' }),
  /** Subscriptions lapse; a one-time purchase never does. */
  accessExpiresAt: integer('access_expires_at', { mode: 'timestamp' }),
  /** When it stopped granting access, and why, for the publisher's ledger. */
  endedAt: integer('ended_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('app_purchases_checkout_idx').on(table.stripeCheckoutSessionId),
  index('app_purchases_user_idx').on(table.appUserId),
  index('app_purchases_app_idx').on(table.appId),
  index('app_purchases_subscription_idx').on(table.stripeSubscriptionId),
  index('app_purchases_intent_idx').on(table.stripePaymentIntentId),
])

/**
 * Every AI call an app makes, reserved before it happens and settled after.
 *
 * Two rows would be simpler — a counter per app, incremented after each call — and
 * would be wrong. A counter read, then written, lets ten simultaneous visitors all
 * see the same remaining allowance and all spend it. So a call inserts its estimate
 * FIRST, under a conditional that fails if the estimate would not fit, and the
 * insert either happens or does not. Admission is the write.
 *
 * Rows are never deleted by publishing or rolling back, which is what keeps a
 * release from resetting the bill.
 */
export const appAiUsage = sqliteTable('app_ai_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id').notNull().references(() => playgroundApps.id, { onDelete: 'cascade' }),
  /** Denormalised so the owner's total is one query rather than a join per app. */
  ownerId: text('owner_id').notNull(),

  /** The customer this was spent on behalf of, when we know who that is. */
  appUserId: text('app_user_id'),
  /** A per-visitor key for people who have not identified themselves. */
  visitorKey: text('visitor_key'),

  /** 'text' | 'image'. Both count; image is the expensive one. */
  kind: text('kind').$type<'text' | 'image'>().notNull(),
  model: text('model'),
  /** True when this came from an owner previewing a draft rather than a customer. */
  isDraft: integer('is_draft', { mode: 'boolean' }).notNull().default(false),

  /**
   * What was set aside before the call, in tenths of a cent.
   *
   * Tenths because a cheap text call costs a fraction of a cent, and rounding every
   * one up to a whole cent would overstate a busy app's spend by an order of magnitude.
   */
  reservedMillicents: integer('reserved_millicents').notNull(),
  /** What it actually cost, once known. Null until settled. */
  actualMillicents: integer('actual_millicents'),

  /**
   * 'reserved'  — in flight, still counts against the limit
   * 'settled'   — finished, actual cost known (or assumed, after a timeout)
   * 'released'  — provider refused before doing work; the reservation is given back
   */
  status: text('status').$type<'reserved' | 'settled' | 'released'>().notNull().default('reserved'),
  /** Why a row was released or assumed-charged, for anyone auditing a bill. */
  note: text('note'),

  /** The window this belongs to, e.g. "2026-09". Limits are per window. */
  periodKey: text('period_key').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  settledAt: integer('settled_at', { mode: 'timestamp' }),
}, (table) => [
  index('app_ai_usage_app_period_idx').on(table.appId, table.periodKey, table.status),
  index('app_ai_usage_owner_period_idx').on(table.ownerId, table.periodKey, table.status),
  index('app_ai_usage_customer_idx').on(table.appId, table.appUserId, table.periodKey),
  index('app_ai_usage_visitor_idx').on(table.appId, table.visitorKey, table.periodKey),
])

// Instruction cards for AI automation
export const instructionCards = sqliteTable('instruction_cards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),

  title: text('title').notNull(),
  instructions: text('instructions').notNull(),
  // 'build' generates an app onto the target card from the card's own thread — see
  // lib/playground/generateApp. Repeat runs iterate the card's existing app rather
  // than spawning a new one. Stored as text, so no migration for the new value.
  action: text('action').$type<'generate' | 'modify' | 'move' | 'report' | 'build'>().notNull(),
  /**
   * The shroom's face, as "shape:pattern:colour" — see lib/shrooms/avatar.
   * Null means nobody picked one, and a stable avatar is derived from the id
   * instead, so a channel's shrooms look different without anyone doing anything.
   */
  avatar: text('avatar'),
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
  coverImageUrl: text('cover_image_url'),

  // 'global' shrooms are offered on every board the owner has, not just channelId's.
  // channelId is still the row's anchor (it's a NOT NULL FK) — it just stops being the
  // only place the shroom shows up.
  scope: text('scope').$type<'channel' | 'global'>().default('channel'),

  // Conversational creation/editing history
  conversationHistory: text('conversation_history', { mode: 'json' }).$type<ShroomChatMessageJson[]>(),

  // Multi-step action sequence
  steps: text('steps', { mode: 'json' }).$type<{ action: string; targetColumnId: string; description: string; cardCount?: number }[]>(),

  // Chaining: run another shroom after this one completes
  nextInstructionId: text('next_instruction_id'),

  // Skip review queue for generate actions
  autoApprove: integer('auto_approve').default(0),

  // "Email me after this runs" — a natural-language brief, not a template.
  // Kan composes the actual email at send time from the brief plus the run's outcome.
  emailConfig: text('email_config', { mode: 'json' }).$type<ShroomEmailConfigJson>(),

  // Generated one-liner shown on the card, distinct from the instructions sent to the model
  summary: text('summary'),

  // Per-shroom model override, provider-qualified ("google:gemini-3.7-flash").
  // NULL means the account default.
  modelId: text('model_id'),

  // Web ability: { mode: 'auto' | 'always' | 'off', focus?: string }. NULL means 'auto'.
  webAccess: text('web_access', { mode: 'json' }).$type<ShroomWebAccessJson>(),

  // What the shroom may do beyond writing a note. NULL means unrestricted.
  capabilities: text('capabilities', { mode: 'json' }).$type<ShroomCapabilitiesJson>(),

  // What a run must be handed for this shroom to make sense. NULL falls back to the
  // action's natural minimum.
  inputRequirements: text('input_requirements', { mode: 'json' }).$type<ShroomInputRequirementsJson>(),

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

// Folder sharing (share an entire folder + all its channels)
export const folderShares = sqliteTable('folder_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  folderId: text('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').$type<'editor' | 'viewer'>().notNull(),

  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: integer('invited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('folder_shares_folder_idx').on(table.folderId),
  index('folder_shares_user_idx').on(table.userId),
  index('folder_shares_email_idx').on(table.email),
])

// Channel sharing (email invites and active shares)
export const channelShares = sqliteTable('channel_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').$type<'owner' | 'editor' | 'viewer'>().notNull(),
  roleDescription: text('role_description'),

  // Back-reference to folder share (for cascade create/delete)
  folderShareId: text('folder_share_id').references(() => folderShares.id, { onDelete: 'set null' }),

  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: integer('invited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_shares_channel_idx').on(table.channelId),
  index('channel_shares_user_idx').on(table.userId),
  index('channel_shares_email_idx').on(table.email),
  uniqueIndex('channel_shares_channel_user').on(table.channelId, table.userId),
  index('channel_shares_folder_share_idx').on(table.folderShareId),
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

// Notifications
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  readAt: integer('read_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_user_read_idx').on(table.userId, table.isRead),
  index('notifications_user_created_idx').on(table.userId, table.createdAt),
])

// Notification preferences
export const notificationPreferences = sqliteTable('notification_preferences', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  disabledTypes: text('disabled_types', { mode: 'json' }).$type<string[]>().default([]),
  browserNotificationsEnabled: integer('browser_notifications_enabled', { mode: 'boolean' }).default(false),
  emailNotificationsEnabled: integer('email_notifications_enabled', { mode: 'boolean' }).default(true),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('notification_preferences_user_idx').on(table.userId),
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

// Rejected shroom output. Feeds back into that shroom's future prompts so it learns
// what not to generate — see buildRejectionContext in lib/ai/feedbackAnalyzer.ts.
export const cardRejections = sqliteTable('card_rejections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  instructionCardId: text('instruction_card_id'),  // no FK — the shroom may be deleted
  cardId: text('card_id'),                         // the (now deleted) card's id
  cardTitle: text('card_title').notNull(),
  reason: text('reason'),                          // RejectionReason
  feedback: text('feedback'),
  createdBy: text('created_by'),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('card_rejections_instruction_idx').on(table.instructionCardId, table.createdAt),
  index('card_rejections_channel_idx').on(table.channelId, table.createdAt),
])

// Channel chat threads (server-stored conversations with Kan at channel level)
export const channelChatThreads = sqliteTable('channel_chat_threads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').default('New conversation'),
  messages: safeJsonText<ChannelChatMessageJson[]>([])('messages').default([]),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_chat_threads_channel_idx').on(table.channelId),
  index('channel_chat_threads_user_idx').on(table.userId),
  index('channel_chat_threads_channel_user_updated_idx').on(table.channelId, table.userId, table.updatedAt),
])

// Operator chat threads (homepage conversations with Kan)
export const operatorChatThreads = sqliteTable('operator_chat_threads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').default('New conversation'),
  messages: safeJsonText<ChannelChatMessageJson[]>([])('messages').default([]),
  // 'voice' for saved voice sessions; null for typed chat. Older voice threads are
  // recognised by their "🎙 " title prefix.
  kind: text('kind'),
  // The title was written by Kan from the conversation, not its first line — so later
  // saves of the same thread must not overwrite it.
  titleGenerated: integer('title_generated', { mode: 'boolean' }).default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('operator_chat_threads_user_idx').on(table.userId),
  index('operator_chat_threads_user_updated_idx').on(table.userId, table.updatedAt),
])

// Email templates (AI-built, saveable)
export const emailTemplates = sqliteTable('email_templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  subject: text('subject').notNull(),
  previewText: text('preview_text'),
  body: text('body', { mode: 'json' }).$type<EmailNodeJson[]>(),
  status: text('status').$type<'draft' | 'active'>().default('draft'),
  conversationHistory: text('conversation_history', { mode: 'json' }).$type<EmailBuilderMessageJson[]>(),
  systemSlug: text('system_slug'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('email_templates_user_idx').on(table.userId),
  uniqueIndex('email_templates_slug_idx').on(table.slug),
])

// Channel digest subscriptions (per-user, per-channel opt-in)
export const channelDigestSubscriptions = sqliteTable('channel_digest_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  frequency: text('frequency').$type<'daily' | 'weekly' | 'monthly'>().notNull().default('weekly'),
  muted: integer('muted', { mode: 'boolean' }).default(false),
  lastSentAt: integer('last_sent_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('channel_digest_subs_user_channel').on(table.userId, table.channelId),
  index('channel_digest_subs_user_idx').on(table.userId),
])

// Channel activity log (events that feed digests)
export const channelActivityLog = sqliteTable('channel_activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').$type<'card_created' | 'card_moved' | 'card_deleted' | 'card_updated' | 'task_created' | 'task_completed'>().notNull(),
  entityType: text('entity_type').$type<'card' | 'task'>().notNull(),
  entityId: text('entity_id').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('channel_activity_log_channel_created_idx').on(table.channelId, table.createdAt),
])

// Digest send log (idempotency + debugging)
export const digestSendLog = sqliteTable('digest_send_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  frequency: text('frequency').$type<'daily' | 'weekly' | 'monthly'>().notNull(),
  periodStart: integer('period_start', { mode: 'timestamp' }).notNull(),
  periodEnd: integer('period_end', { mode: 'timestamp' }).notNull(),
  activityCount: integer('activity_count').notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

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

interface TaskNoteJson {
  id: string
  content: string
  authorId?: string
  authorName?: string
  authorImage?: string
  createdAt: string
  editedAt?: string
}

interface CardMessageJson {
  id: string
  type: 'note' | 'question' | 'ai_response'
  content: string
  imageUrls?: string[]
  /** Whiteboard sketches attached to this message. Rendered inline; the uploaded
   *  PNG is what the model actually looks at. */
  whiteboards?: { id: string; snapshot: string; snapshotImageUrl?: string }[]
  authorId?: string
  createdAt: string
  replyToMessageId?: string
  reactions?: { emoji: string; userId: string; userName?: string }[]
  shroomRunId?: string
  shroomRan?: boolean
}

/** Token spend on a single playground generation. */
interface PlaygroundUsageJson {
  modelId: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  /** 'patch' when only the changed lines were regenerated. */
  strategy?: 'patch' | 'rewrite'
  patchOutcome?: 'applied' | 'declined' | 'rejected'
}

/** A record a running playground app persisted via window.kanthinkSave. */
interface SavedRecordJson {
  slug: string
  data: unknown
  label?: string
  createdAt: number
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
  triggeredBy: 'scheduled' | 'event' | 'threshold' | 'manual'
  success: boolean
  cardsAffected: number
  /** Present when the run was declined (daily cap, loop prevention) rather than attempted. */
  skippedReason?: string
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

interface ChannelChatMessageJson {
  id: string
  type: 'question' | 'ai_response'
  content: string
  imageUrls?: string[]
  authorId?: string
  authorName?: string
  authorImage?: string
  createdAt: string
  replyToMessageId?: string
  proposedActions?: unknown[]
}

interface ShroomChatMessageJson {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ShroomEmailConfigJson {
  enabled: boolean
  brief: string
  subjectHint?: string
  skipWhenNothingHappened?: boolean
}

interface ShroomWebAccessJson {
  mode: 'auto' | 'always' | 'off'
  focus?: string
}

interface ShroomCapabilitiesJson {
  tasks: boolean
  tags: boolean
  properties: boolean
  assignment: boolean
}

interface ShroomInputRequirementsJson {
  minCards: number
  reason?: string
}

interface EmailBuilderMessageJson {
  role: 'user' | 'assistant'
  content: string
  rawContent?: string
}

// Re-export-friendly type for EmailNode JSON (matches dynamicRenderer's EmailNode)
export type EmailNodeJson = string | EmailElementJson | EmailNodeJson[]
interface EmailElementJson {
  type: string
  props?: Record<string, unknown>
  children?: EmailNodeJson
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
export type DbFolderShare = typeof folderShares.$inferSelect
export type NewDbFolderShare = typeof folderShares.$inferInsert
export type DbChannelShare = typeof channelShares.$inferSelect
export type NewDbChannelShare = typeof channelShares.$inferInsert
export type DbChannelInviteLink = typeof channelInviteLinks.$inferSelect
export type NewDbChannelInviteLink = typeof channelInviteLinks.$inferInsert
export type DbInstructionRun = typeof instructionRuns.$inferSelect
export type NewDbInstructionRun = typeof instructionRuns.$inferInsert
export type DbNotification = typeof notifications.$inferSelect
export type NewDbNotification = typeof notifications.$inferInsert
export type DbNotificationPreferences = typeof notificationPreferences.$inferSelect
export type NewDbNotificationPreferences = typeof notificationPreferences.$inferInsert
export type DbChannelChatThread = typeof channelChatThreads.$inferSelect
export type NewDbChannelChatThread = typeof channelChatThreads.$inferInsert
export type DbEmailTemplate = typeof emailTemplates.$inferSelect
export type NewDbEmailTemplate = typeof emailTemplates.$inferInsert
export type DbChannelDigestSubscription = typeof channelDigestSubscriptions.$inferSelect
export type NewDbChannelDigestSubscription = typeof channelDigestSubscriptions.$inferInsert
export type DbChannelActivityLog = typeof channelActivityLog.$inferSelect
export type NewDbChannelActivityLog = typeof channelActivityLog.$inferInsert
export type DbDigestSendLog = typeof digestSendLog.$inferSelect
export type NewDbDigestSendLog = typeof digestSendLog.$inferInsert

// Published content pages (from Channel Actions)
export const contentPages = sqliteTable('content_pages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  title: text('title'),
  description: text('description'),
  channelName: text('channel_name'),
  type: text('type').$type<'newsletter' | 'course' | 'blog'>(),
  htmlContent: text('html_content'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('content_pages_token_idx').on(table.token),
  index('content_pages_channel_idx').on(table.channelId),
])

export type DbContentPage = typeof contentPages.$inferSelect
export type NewDbContentPage = typeof contentPages.$inferInsert

// ===== /record — screen + webcam demo recordings =====

// A loading-mask covers a time range of the video in the player (non-destructive edit).
export interface RecordingMaskJson {
  id: string
  start: number          // seconds
  end: number            // seconds
  style: 'cover' | 'blur'
  label?: string         // text shown on a 'cover' mask
}

// editSpec is applied at playback time by the watch player — fully reversible.
export interface RecordingEditSpecJson {
  trimStart: number       // seconds; 0 = from beginning
  trimEnd: number | null  // seconds; null = to end
  masks: RecordingMaskJson[]
}

export const recordings = sqliteTable('recordings', {
  id: text('id').primaryKey(),                 // nanoid, used in the share URL
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled recording'),

  // Cloudinary video asset
  cloudinaryPublicId: text('cloudinary_public_id').notNull(),
  cloudinaryUrl: text('cloudinary_url').notNull(),

  durationMs: integer('duration_ms').notNull().default(0),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  aspectRatio: text('aspect_ratio').default('16:9'),  // label: '16:9' | '9:16' | '1:1' | '4:3'

  // Thumbnail: if thumbUrl is set (AI-generated / custom image) it wins; otherwise
  // the gallery derives a video frame from Cloudinary at thumbTime seconds (0 = first frame).
  thumbUrl: text('thumb_url'),
  thumbTime: integer('thumb_time').notNull().default(0),

  editSpec: safeJsonText<RecordingEditSpecJson>({ trimStart: 0, trimEnd: null, masks: [] })('edit_spec')
    .default({ trimStart: 0, trimEnd: null, masks: [] }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('recordings_owner_idx').on(table.ownerId),
])

export type DbRecording = typeof recordings.$inferSelect
export type NewDbRecording = typeof recordings.$inferInsert

// One row per view of a shared recording. A table rather than a counter column
// so "when did the views happen" stays answerable — the question that actually
// matters after sending a link is whether anyone watched it *today*, which a
// running total can't answer.
//
// Owner views are recorded but flagged, not dropped: watching your own video is
// real traffic worth seeing, it just shouldn't inflate the number you quote to
// anyone else. Counts shown in the UI exclude them.
export const recordingViews = sqliteTable('recording_views', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recordingId: text('recording_id').notNull().references(() => recordings.id, { onDelete: 'cascade' }),
  isOwner: integer('is_owner', { mode: 'boolean' }).notNull().default(false),
  // Host only ("mail.google.com"), never the full URL — enough to tell a Slack
  // click from an email click without collecting anyone's browsing history.
  referrerHost: text('referrer_host'),
  viewedAt: integer('viewed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('recording_views_recording_idx').on(table.recordingId),
])

export type DbRecordingView = typeof recordingViews.$inferSelect

// ===== /catlife — Whisker Wilds kid accounts + cloud saves =====
// Standalone from Kanthink users: kids sign in with a simple username +
// password (parent email kept for recovery). One row per kid, save JSON inline.

export const catlifePlayers = sqliteTable('catlife_players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text('username').notNull().unique(),      // stored lowercase
  passwordHash: text('password_hash').notNull(),      // scrypt salt:hash (hex)
  parentEmail: text('parent_email'),
  token: text('token'),                               // bearer token for the tablet
  saveData: text('save_data'),                        // full SaveData JSON
  saveUpdatedAt: integer('save_updated_at'),          // epoch seconds
  createdAt: integer('created_at'),                   // epoch seconds
}, (table) => [
  index('catlife_players_token_idx').on(table.token),
])

export type DbCatlifePlayer = typeof catlifePlayers.$inferSelect

// ---- Kanwatch -----------------------------------------------------------------
// Browser activity, reduced by extensions/kanwatch/privacy.js before it is stored:
// sensitive sites keep timing only, and every text field is scrubbed. Raw visits
// expire after 30 days; episodes (the judged summaries) are what the day view reads.

// A revocable key for the extension. Only the SHA-256 of the token is stored.
export const kanwatchTokens = sqliteTable('kanwatch_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('kanwatch_tokens_hash_idx').on(table.tokenHash),
])

// One stretch of time on one page. The id comes from the extension, so a retried
// upload is a no-op rather than a duplicate.
export const kanwatchVisits = sqliteTable('kanwatch_visits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  episodeId: text('episode_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }).notNull(),
  activeSeconds: integer('active_seconds').notNull().default(0),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  // Playing alongside — sound from a tab that wasn't the page you were on. Context,
  // never attention: it belongs to no episode and adds no active time.
  isBackground: integer('is_background', { mode: 'boolean' }).default(false),
  domain: text('domain'),
  path: text('path'),
  title: text('title'),
  heading: text('heading'),
  description: text('description'),
  searchQuery: text('search_query'),
  // Engagement, as counts only — never what was typed.
  keystrokes: integer('keystrokes').default(0),
  clicks: integer('clicks').default(0),
  scrollDepth: integer('scroll_depth').default(0),     // furthest point reached, 0–100
  mediaSeconds: integer('media_seconds').default(0),   // audio/video playing while active
  // Jev's read of this page on its own: 'priority' (today's), 'work' (other work),
  // 'not_work', or 'unclear'. Null until read. What focus and drift are counted from.
  focus: text('focus').$type<'priority' | 'work' | 'not_work' | 'unclear'>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('kanwatch_visits_user_time_idx').on(table.userId, table.startedAt),
  index('kanwatch_visits_episode_idx').on(table.episodeId),
])

// Consecutive visits grouped into one stretch of work, and what Jev made of it.
export const kanwatchEpisodes = sqliteTable('kanwatch_episodes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }).notNull(),
  activeSeconds: integer('active_seconds').notNull().default(0),
  privateSeconds: integer('private_seconds').notNull().default(0),
  tzOffsetMinutes: integer('tz_offset_minutes'),
  status: text('status').$type<'open' | 'closed' | 'judged'>().notNull().default('open'),
  // Jev's read. guess_kind: 'channel' | 'card' | 'new_work' | 'not_work' | 'unclear' | 'private'
  guessKind: text('guess_kind'),
  guessChannelId: text('guess_channel_id'),
  guessCardId: text('guess_card_id'),
  guessProbability: integer('guess_probability'),     // 0–100
  activityMode: text('activity_mode'),                // building, researching, learning, …
  focusScore: integer('focus_score'),                 // 0–100 against the day's intention
  worthCardProbability: integer('worth_card_probability'),
  jevModel: text('jev_model'),
  judgedAt: integer('judged_at', { mode: 'timestamp' }),
  guessLabel: text('guess_label'),                    // guess_kind 'area': one of the user's own named areas
  verdictMode: text('verdict_mode'),                  // what the user said they were doing (overrides activity_mode)
  boardSig: text('board_sig'),                        // fingerprint of the channels/folders it was read against
  domains: text('domains'),                           // JSON string[] of sites, for per-site learning
  basis: text('basis'),                               // JSON: what the read drew on (notes, past answers)
  // What the user said it actually was — the training signal.
  verdict: text('verdict').$type<'confirmed' | 'corrected' | 'not_work'>(),
  verdictChannelId: text('verdict_channel_id'),
  verdictCardId: text('verdict_card_id'),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('kanwatch_episodes_user_time_idx').on(table.userId, table.startedAt),
  index('kanwatch_episodes_status_idx').on(table.userId, table.status),
])

// What a given day was meant to be about. Keyed by the user's local date.
export const kanwatchDays = sqliteTable('kanwatch_days', {
  id: text('id').primaryKey(),                        // `${userId}:${YYYY-MM-DD}`
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  intention: text('intention'),
  // Kan's written read on the day (JSON DayStory), and the day it was written from.
  story: text('story'),
  storySig: text('story_sig'),
  storyAt: integer('story_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// The user's own read on a site: what it is for them, and whether they want more
// or less of it. Fed back into judging, and the basis for focus tips.
export const kanwatchSites = sqliteTable('kanwatch_sites', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  want: text('want').$type<'more' | 'right' | 'less'>(),
  purpose: text('purpose'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('kanwatch_sites_user_domain_idx').on(table.userId, table.domain),
])

// A public page you spent real time reading, and what Kan made of it. Only pages that
// pass readablePageKind() in extensions/kanwatch/privacy.js ever get a row: posts,
// articles, videos, discussions, docs — never feeds, inboxes, or your own tools.
export const kanwatchReads = sqliteTable('kanwatch_reads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),                         // public link back, no query string
  domain: text('domain'),
  title: text('title'),
  kind: text('kind'),                                 // post | video | discussion | article | docs
  text: text('text'),                                 // scrubbed page text, capped; expires with visits
  seconds: integer('seconds').notNull().default(0),   // total time spent reading, across visits
  manual: integer('manual', { mode: 'boolean' }).default(false), // you pressed "Kan, read this page"
  status: text('status').$type<'pending' | 'judged' | 'failed'>().notNull().default('pending'),
  // Jev's read (0–100)
  category: text('category'),
  aboutWork: integer('about_work'),
  worth: integer('worth'),
  kanthinkFit: integer('kanthink_fit'),
  appIdea: integer('app_idea'),
  // The LLM's, only for pages Jev thought were worth it
  tldr: text('tldr'),
  why: text('why'),
  nudgeKind: text('nudge_kind'),                      // kanthink | app | revisit | reflect
  nudge: text('nudge'),
  // What you did with it
  verdict: text('verdict').$type<'saved' | 'dismissed'>(),
  reflection: text('reflection'),
  cardId: text('card_id'),
  // App ideas: which existing app it would extend (if any), the app built from it,
  // and when Kan nudged you about it (capped per day).
  relatedAppId: text('related_app_id'),
  relatedAppFit: integer('related_app_fit'),
  appId: text('app_id'),
  notifiedAt: integer('notified_at', { mode: 'timestamp' }),
  jevModel: text('jev_model'),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('kanwatch_reads_user_url_idx').on(table.userId, table.url),
  index('kanwatch_reads_user_seen_idx').on(table.userId, table.lastSeenAt),
])
