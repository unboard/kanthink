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

  // Indexes — IF NOT EXISTS works for these
  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences (user_id)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, is_read)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at)`,
  ]

  for (const idx of indexes) {
    try {
      await db.run(sql.raw(idx))
    } catch {}
  }

  ensured = true
}
