/**
 * Every schema statement, in one place, as plain SQL strings.
 *
 * This is deliberately dependency-free ESM rather than TypeScript so that BOTH
 * consumers can read it:
 *
 *   - `lib/db/ensure-schema.ts` — the request-time safety net, via Drizzle.
 *   - `scripts/migrate.mjs`     — the deploy-time migration step, via plain `node`
 *                                 and @libsql/client, with no build tooling involved.
 *
 * Keeping one list means a migration can never be applied by one path and missed by
 * the other. Add new statements to the bottom of the relevant array and nowhere else.
 *
 * Everything here must be idempotent — these run on every deploy and every cold start.
 */

/**
 * ALTER TABLE / CREATE TABLE statements.
 *
 * SQLite's ALTER TABLE has no IF NOT EXISTS, so re-running throws "duplicate column
 * name". Callers swallow that; see `isBenignMigrationError`.
 * @type {string[]}
 */
export const ALTER_STATEMENTS = [
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
  // Migration 0022 — agent processing state
  `ALTER TABLE cards ADD is_processing integer DEFAULT 0`,
  `ALTER TABLE cards ADD processing_status text`,
  // Migration 0023 — notification preferences
  `CREATE TABLE IF NOT EXISTS notification_preferences (id text PRIMARY KEY, user_id text NOT NULL, disabled_types text, browser_notifications_enabled integer DEFAULT 1, created_at integer, updated_at integer)`,
  `ALTER TABLE notification_preferences ADD id text`,
  `ALTER TABLE notification_preferences ADD user_id text`,
  `ALTER TABLE notification_preferences ADD disabled_types text`,
  `ALTER TABLE notification_preferences ADD browser_notifications_enabled integer DEFAULT 1`,
  `ALTER TABLE notification_preferences ADD created_at integer`,
  `ALTER TABLE notification_preferences ADD updated_at integer`,
  // Migration 0024 — content pages (CREATE TABLE + individual columns for migration guard)
  `CREATE TABLE IF NOT EXISTS content_pages (id text PRIMARY KEY, channel_id text, token text NOT NULL UNIQUE, title text, description text, channel_name text, type text, html_content text, created_at integer)`,
  `ALTER TABLE content_pages ADD id text`,
  `ALTER TABLE content_pages ADD channel_id text`,
  `ALTER TABLE content_pages ADD token text`,
  `ALTER TABLE content_pages ADD title text`,
  `ALTER TABLE content_pages ADD description text`,
  `ALTER TABLE content_pages ADD channel_name text`,
  `ALTER TABLE content_pages ADD type text`,
  `ALTER TABLE content_pages ADD html_content text`,
  `ALTER TABLE content_pages ADD created_at integer`,
  // Migration 0025 — task archiving
  `ALTER TABLE tasks ADD is_archived integer DEFAULT 0`,
  // Migration 0026 — recordings (/record) individual columns for migration guard
  `ALTER TABLE recordings ADD title text DEFAULT 'Untitled recording'`,
  `ALTER TABLE recordings ADD cloudinary_public_id text`,
  `ALTER TABLE recordings ADD cloudinary_url text`,
  `ALTER TABLE recordings ADD duration_ms integer DEFAULT 0`,
  `ALTER TABLE recordings ADD width integer DEFAULT 0`,
  `ALTER TABLE recordings ADD height integer DEFAULT 0`,
  `ALTER TABLE recordings ADD aspect_ratio text DEFAULT '16:9'`,
  `ALTER TABLE recordings ADD edit_spec text`,
  // Migration 0027 — recording thumbnails (first frame / scene frame / AI image)
  `ALTER TABLE recordings ADD thumb_url text`,
  `ALTER TABLE recordings ADD thumb_time integer DEFAULT 0`,
  // Migration 0030 — pending-review card state (third position bucket)
  `ALTER TABLE cards ADD is_pending_review integer DEFAULT 0`,
  `ALTER TABLE cards ADD review_run_id text`,
  // Migration 0031 — shroom scope ('channel' | 'global'), previously client-only
  `ALTER TABLE instruction_cards ADD scope text DEFAULT 'channel'`,
  // Migration 0032 — "email me after this runs" brief on a shroom
  `ALTER TABLE instruction_cards ADD email_config text`,
  // Migration 0033 — generated one-line description shown on the shroom card
  `ALTER TABLE instruction_cards ADD summary text`,
  // Migration 0034 — sticky per-column sort preference. Deliberately no DEFAULT:
  // pre-existing rows stay NULL so "never chose a sort" is distinguishable from
  // "explicitly chose manual", which lets one-time backfills target only the former.
  // Drizzle supplies 'manual' on new inserts, and readers coerce NULL to 'manual'.
  `ALTER TABLE columns ADD sort_order text`,
  // Migration 0035 — default share-sheet destination, per user
  `ALTER TABLE users ADD save_default_channel_id text`,
  `ALTER TABLE users ADD save_default_column_id text`,
  // Migration 0036 — per-shroom model override and web-browsing ability
  `ALTER TABLE instruction_cards ADD model_id text`,
  `ALTER TABLE instruction_cards ADD web_access text`,
  // Migration 0037 — shroom capabilities and input requirements, replacing the
  // keyword-sniffing that used to infer both from the instructions on every run
  `ALTER TABLE instruction_cards ADD capabilities text`,
  `ALTER TABLE instruction_cards ADD input_requirements text`,
]

/**
 * Full CREATE TABLE definitions. All IF NOT EXISTS, so safe to re-run.
 * @type {string[]}
 */
export const CREATE_TABLE_STATEMENTS = [
  // Migration 0004
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    disabled_types text DEFAULT '[]',
    browser_notifications_enabled integer DEFAULT false,
    created_at integer,
    updated_at integer,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
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
  )`,
  // Migration 0006 — folder_shares table
  `CREATE TABLE IF NOT EXISTS folder_shares (
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
  )`,
  // Migration 0006 — add folder_share_id to channel_shares
  `ALTER TABLE channel_shares ADD folder_share_id text REFERENCES folder_shares(id)`,
  // Migration 0007 — channel_chat_threads table
  `CREATE TABLE IF NOT EXISTS channel_chat_threads (
    id text PRIMARY KEY NOT NULL,
    channel_id text NOT NULL,
    user_id text NOT NULL,
    title text DEFAULT 'New conversation',
    messages text DEFAULT '[]',
    created_at integer,
    updated_at integer,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`,
  // Migration 0010 — email_templates table
  `CREATE TABLE IF NOT EXISTS email_templates (
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
  )`,
  // Migration 0011 — channel_digest_subscriptions
  `CREATE TABLE IF NOT EXISTS channel_digest_subscriptions (
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
  )`,
  // Migration 0011 — channel_activity_log
  `CREATE TABLE IF NOT EXISTS channel_activity_log (
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
  )`,
  // Migration 0011 — digest_send_log
  `CREATE TABLE IF NOT EXISTS digest_send_log (
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
  )`,
  // Migration 0012 — channel_data_sources (Mixpanel, etc.)
  `CREATE TABLE IF NOT EXISTS channel_data_sources (
    id text PRIMARY KEY NOT NULL,
    channel_id text NOT NULL,
    provider text NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at integer,
    metadata text,
    status text DEFAULT 'active',
    created_at integer,
    updated_at integer,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade
  )`,
  // Migration 0026 — recordings (/record screen + webcam demos)
  `CREATE TABLE IF NOT EXISTS recordings (
    id text PRIMARY KEY NOT NULL,
    owner_id text NOT NULL,
    title text DEFAULT 'Untitled recording',
    cloudinary_public_id text NOT NULL,
    cloudinary_url text NOT NULL,
    duration_ms integer DEFAULT 0,
    width integer DEFAULT 0,
    height integer DEFAULT 0,
    aspect_ratio text DEFAULT '16:9',
    thumb_url text,
    thumb_time integer DEFAULT 0,
    edit_spec text,
    created_at integer,
    updated_at integer,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE cascade
  )`,
  // Migration 0025 — operator chat threads
  `CREATE TABLE IF NOT EXISTS operator_chat_threads (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    title text DEFAULT 'New conversation',
    messages text DEFAULT '[]',
    created_at integer,
    updated_at integer,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`,
  // Migration 0028 — Whisker Wilds kid accounts + cloud saves
  `CREATE TABLE IF NOT EXISTS catlife_players (
    id text PRIMARY KEY NOT NULL,
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    parent_email text,
    token text,
    save_data text,
    save_updated_at integer,
    created_at integer
  )`,
  // Migration 0030 — rejected shroom output (feeds back into shroom prompts)
  `CREATE TABLE IF NOT EXISTS card_rejections (
    id text PRIMARY KEY NOT NULL,
    channel_id text NOT NULL,
    instruction_card_id text,
    card_id text,
    card_title text NOT NULL,
    reason text,
    feedback text,
    created_by text,
    created_at integer,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE cascade
  )`,
  // Migration 0036 — per-view rows for shared recordings
  `CREATE TABLE IF NOT EXISTS recording_views (
    id text PRIMARY KEY NOT NULL,
    recording_id text NOT NULL,
    is_owner integer NOT NULL DEFAULT false,
    referrer_host text,
    viewed_at integer,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS recording_views_recording_idx ON recording_views (recording_id)`,
]

/**
 * One-off data corrections. Must be written so re-running is a no-op.
 * @type {string[]}
 */
export const DATA_MIGRATIONS = [
  // Rename Quick Save → Kan Bookmarks
  `UPDATE channels SET name = 'Kan Bookmarks', description = 'Your personal bookmark channel. Save anything from the web — links, articles, ideas, snippets — and Kan will organize and comment on them. Use the browser bookmarklet (desktop) or share sheet (mobile) to save from anywhere.' WHERE is_quick_save = 1 AND name = 'Quick Save'`,
]

/**
 * Indexes. All IF NOT EXISTS.
 * @type {string[]}
 */
export const INDEX_STATEMENTS = [
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
  // Migration 0012 indexes
  `CREATE INDEX IF NOT EXISTS channel_data_sources_channel_idx ON channel_data_sources (channel_id)`,
  `CREATE INDEX IF NOT EXISTS channel_data_sources_channel_provider_idx ON channel_data_sources (channel_id, provider)`,
  // Migration 0026 indexes
  `CREATE INDEX IF NOT EXISTS recordings_owner_idx ON recordings (owner_id)`,
  // Migration 0028 indexes
  `CREATE INDEX IF NOT EXISTS catlife_players_token_idx ON catlife_players (token)`,
  // Migration 0030 indexes
  `CREATE INDEX IF NOT EXISTS cards_review_idx ON cards (column_id, is_pending_review)`,
  `CREATE INDEX IF NOT EXISTS card_rejections_instruction_idx ON card_rejections (instruction_card_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS card_rejections_channel_idx ON card_rejections (channel_id, created_at)`,
]

/**
 * Every statement, in the order it must run.
 *
 * CREATE TABLE comes before ALTER TABLE: several ALTERs target tables this file also
 * creates (recordings, notification_preferences, content_pages), and on a database
 * that doesn't have them yet those ALTERs would otherwise fail for the uninteresting
 * reason that the table hasn't been made.
 *
 * @type {string[]}
 */
/**
 * Tables belonging to features that have been removed.
 *
 * Ordered last in ALL_STATEMENTS, after every create and index, so a drop is
 * never undone by a statement earlier in the same pass. IF EXISTS keeps it
 * idempotent — these run on every deploy and every cold start, and must be a
 * no-op once applied.
 *
 * Deleting a feature's CREATE TABLE is not enough on its own: databases that
 * already ran it keep the table forever. The drop has to be stated explicitly.
 * @type {string[]}
 */
export const DROP_STATEMENTS = [
  // /calendar marketing calendar, removed 2026-08-21 along with /mcs.
  `DROP TABLE IF EXISTS marketing_ideas`,
  `DROP TABLE IF EXISTS marketing_assets`,
  `DROP TABLE IF EXISTS marketing_chat`,
]

export const ALL_STATEMENTS = [
  ...CREATE_TABLE_STATEMENTS,
  ...ALTER_STATEMENTS,
  ...DATA_MIGRATIONS,
  ...INDEX_STATEMENTS,
  ...DROP_STATEMENTS,
]

/**
 * Every column added by an ALTER statement above, derived from the statements
 * themselves rather than hand-listed.
 *
 * The deploy step asserts all of these exist before it lets a build through. Without
 * that assertion, an ALTER whose error got swallowed means the app ships expecting a
 * column the database doesn't have — and because Drizzle names columns explicitly in
 * every SELECT, that breaks *every* query on the table, not just the new feature.
 *
 * Derived, not maintained: a hand-written list is one more thing to forget, and the
 * whole point is to catch the case where someone forgot something. Adding an ALTER
 * automatically adds its assertion.
 *
 * @type {Array<[string, string]>}
 */
export const REQUIRED_COLUMNS = (() => {
  /** @type {Array<[string, string]>} */
  const required = []
  const seen = new Set()
  const pattern = /^ALTER TABLE (\w+) ADD (?:COLUMN )?(\w+)/i
  for (const stmt of [...ALTER_STATEMENTS, ...CREATE_TABLE_STATEMENTS]) {
    const match = stmt.match(pattern)
    if (!match) continue
    const key = `${match[1]}.${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    required.push([match[1], match[2]])
  }
  return required
})()

/**
 * True for errors that just mean "this statement had nothing to do".
 *
 * Matched on message text rather than swallowing everything, so a genuine failure
 * (bad SQL, auth rejected, network down) still fails the deploy. "No such table" is
 * included because a handful of ALTERs target tables owned by the initial Drizzle
 * migration, which a scratch database won't have — the REQUIRED_COLUMNS check is what
 * actually guarantees the end state, so individual statements can be forgiving.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isBenignMigrationError(error) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('duplicate column') ||
    message.includes('already exists') ||
    message.includes('no such table')
  )
}
