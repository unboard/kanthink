import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

let ensured = false

/**
 * Ensure all schema migrations have been applied.
 * Runs missing ALTER TABLE / CREATE TABLE statements idempotently.
 * Safe to call on every request — uses a module-level flag to skip after first run.
 */
export async function ensureSchema() {
  if (ensured) return

  // ALTER TABLE doesn't support IF NOT EXISTS in SQLite,
  // so we catch and ignore "already exists" errors.
  const alterStatements = [
    // Migration 0001
    `ALTER TABLE channels ADD is_global_help integer DEFAULT false`,
    `ALTER TABLE instruction_cards ADD is_global_resource integer DEFAULT false`,
    `ALTER TABLE instruction_cards ADD conversation_history text`,
    // Migration 0002
    `ALTER TABLE cards ADD assigned_to text`,
    `ALTER TABLE instruction_cards ADD steps text`,
    // Migration 0003
    `ALTER TABLE channel_shares ADD role_description text`,
    // Migration 0005
    `ALTER TABLE tasks ADD notes text DEFAULT '[]'`,
    // Migration 0006
    `ALTER TABLE tasks ADD created_by text`,
    // Migration 0008
    `ALTER TABLE tasks ADD column_id text`,
    // Migration 0009
    `ALTER TABLE notification_preferences ADD email_notifications_enabled integer DEFAULT true`,
    // Migration 0012
    `ALTER TABLE email_templates ADD system_slug text`,
    // Migration 0013 — card sharing + cover images
    `ALTER TABLE cards ADD cover_image_url text`,
    `ALTER TABLE cards ADD is_public integer DEFAULT false`,
    `ALTER TABLE cards ADD share_token text`,
    `ALTER TABLE channels ADD cover_image_url text`,
    `ALTER TABLE instruction_cards ADD cover_image_url text`,
    // Migration 0014 — card share theme
    `ALTER TABLE cards ADD share_theme text DEFAULT 'conversational'`,
    // Migration 0015 — Quick Save channel flag
    `ALTER TABLE channels ADD is_quick_save integer DEFAULT false`,
    // Migration 0016 — Card & task snooze + shroom chaining
    `ALTER TABLE cards ADD snoozed_until integer`,
    `ALTER TABLE tasks ADD snoozed_until integer`,
    `ALTER TABLE instruction_cards ADD next_instruction_id text`,
    // Migration 0017 — card pinning
    `ALTER TABLE cards ADD pinned_at integer`,
    // Migration 0018 — card reactions
    `ALTER TABLE cards ADD reactions text`,
    // Migration 0019 — widget card types
    `ALTER TABLE cards ADD card_type text`,
    `ALTER TABLE cards ADD type_data text`,
    // Migration 0020 — auto-approve for generate shrooms
    `ALTER TABLE instruction_cards ADD auto_approve integer DEFAULT 0`,
    // Migration 0021 — card color coding
    `ALTER TABLE cards ADD color text`,
  ]

  for (const stmt of alterStatements) {
    try {
      await db.run(sql.raw(stmt))
    } catch {
      // Expected: column already exists
    }
  }

  // CREATE TABLE IF NOT EXISTS is safe to run repeatedly
  // Migration 0004
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS notification_preferences (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      disabled_types text DEFAULT '[]',
      browser_notifications_enabled integer DEFAULT false,
      created_at integer,
      updated_at integer,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )`))
  } catch {}

  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS notifications (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      type text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      data text,
      is_read integer DEFAULT false,
      read_at integer,
      created_at integer,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )`))
  } catch {}

  // Migration 0006 — folder_shares table
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS folder_shares (
      id text PRIMARY KEY NOT NULL,
      folder_id text NOT NULL,
      user_id text,
      email text,
      role text NOT NULL,
      invited_by text,
      invited_at integer,
      accepted_at integer,
      created_at integer,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE cascade,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE set null
    )`))
  } catch {}

  // Migration 0006 — add folder_share_id to channel_shares
  try {
    await db.run(sql.raw(`ALTER TABLE channel_shares ADD folder_share_id text REFERENCES folder_shares(id)`))
  } catch {}

  // Migration 0007 — channel_chat_threads table
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS channel_chat_threads (
      id text PRIMARY KEY NOT NULL,
      channel_id text NOT NULL,
      user_id text NOT NULL,
      title text DEFAULT 'New conversation',
      messages text DEFAULT '[]',
      created_at integer,
      updated_at integer,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )`))
  } catch {}

  // Migration 0010 — email_templates table
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS email_templates (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      subject text NOT NULL,
      preview_text text,
      body text,
      status text DEFAULT 'draft',
      conversation_history text,
      created_at integer,
      updated_at integer,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )`))
  } catch {}

  // Migration 0011 — channel_digest_subscriptions
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS channel_digest_subscriptions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      channel_id text NOT NULL,
      frequency text NOT NULL DEFAULT 'weekly',
      muted integer DEFAULT false,
      last_sent_at integer,
      created_at integer,
      updated_at integer,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade
    )`))
  } catch {}

  // Migration 0011 — channel_activity_log
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS channel_activity_log (
      id text PRIMARY KEY NOT NULL,
      channel_id text NOT NULL,
      user_id text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      metadata text,
      created_at integer,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )`))
  } catch {}

  // Migration 0011 — digest_send_log
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS digest_send_log (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      channel_id text NOT NULL,
      frequency text NOT NULL,
      period_start integer NOT NULL,
      period_end integer NOT NULL,
      activity_count integer NOT NULL,
      sent_at integer,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade
    )`))
  } catch {}

  // Indexes — IF NOT EXISTS works for these
  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences (user_id)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, is_read)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at)`,
    // Migration 0006 indexes
    `CREATE INDEX IF NOT EXISTS folder_shares_folder_idx ON folder_shares (folder_id)`,
    `CREATE INDEX IF NOT EXISTS folder_shares_user_idx ON folder_shares (user_id)`,
    `CREATE INDEX IF NOT EXISTS folder_shares_email_idx ON folder_shares (email)`,
    `CREATE INDEX IF NOT EXISTS channel_shares_folder_share_idx ON channel_shares (folder_share_id)`,
    // Migration 0007 indexes
    `CREATE INDEX IF NOT EXISTS channel_chat_threads_channel_idx ON channel_chat_threads (channel_id)`,
    `CREATE INDEX IF NOT EXISTS channel_chat_threads_user_idx ON channel_chat_threads (user_id)`,
    `CREATE INDEX IF NOT EXISTS channel_chat_threads_channel_user_updated_idx ON channel_chat_threads (channel_id, user_id, updated_at)`,
    // Migration 0008 indexes
    `CREATE INDEX IF NOT EXISTS tasks_column_idx ON tasks (column_id)`,
    // Migration 0010 indexes
    `CREATE INDEX IF NOT EXISTS email_templates_user_idx ON email_templates (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS email_templates_slug_idx ON email_templates (slug)`,
    // Migration 0011 indexes
    `CREATE UNIQUE INDEX IF NOT EXISTS channel_digest_subs_user_channel ON channel_digest_subscriptions (user_id, channel_id)`,
    `CREATE INDEX IF NOT EXISTS channel_digest_subs_user_idx ON channel_digest_subscriptions (user_id)`,
    `CREATE INDEX IF NOT EXISTS channel_activity_log_channel_created_idx ON channel_activity_log (channel_id, created_at)`,
  ]

  for (const idx of indexes) {
    try {
      await db.run(sql.raw(idx))
    } catch {}
  }

  ensured = true
}
