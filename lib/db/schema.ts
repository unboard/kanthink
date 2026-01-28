import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'

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
  byokProvider: text('byok_provider').$type<'anthropic' | 'openai' | null>(),
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

// Type exports
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UsageRecord = typeof usageRecords.$inferSelect
