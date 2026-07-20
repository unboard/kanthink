/**
 * Schema Migration Guard
 *
 * Verifies that every column defined in schema.ts has a corresponding
 * migration in ensure-schema.ts (either an ALTER TABLE ADD or a CREATE TABLE).
 *
 * This catches the #1 cause of production crashes: adding a column to schema.ts
 * without a matching migration, which causes Drizzle's explicit SELECT to fail.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Parse schema.ts to extract table definitions and their columns
function parseSchemaColumns(schemaSource: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()

  // Find each sqliteTable call and extract the table name
  // Then find all column definitions (text/integer/safeJsonText calls with a db column name)
  // by scanning from the opening { to the matching closing }
  const tableStartRegex = /export const \w+ = sqliteTable\(['"](\w+)['"]\s*,\s*\{/g

  let startMatch
  while ((startMatch = tableStartRegex.exec(schemaSource)) !== null) {
    const tableName = startMatch[1]
    // Find the matching closing brace by counting braces
    let depth = 1
    let i = startMatch.index + startMatch[0].length
    while (i < schemaSource.length && depth > 0) {
      if (schemaSource[i] === '{') depth++
      else if (schemaSource[i] === '}') depth--
      i++
    }
    const columnsBlock = schemaSource.slice(startMatch.index + startMatch[0].length, i - 1)
    const cols = new Set<string>()

    // Match column definitions: text('db_name'), integer('db_name'), safeJsonText<...>(...)('db_name')
    const colRegex = /(?:text|integer)\(['"](\w+)['"]/g
    let colMatch
    while ((colMatch = colRegex.exec(columnsBlock)) !== null) {
      cols.add(colMatch[1])
    }
    // Also match safeJsonText<T>(fallback)('db_name')
    const safeJsonRegex = /safeJsonText[^(]*\([^)]*\)\(['"](\w+)['"]/g
    while ((colMatch = safeJsonRegex.exec(columnsBlock)) !== null) {
      cols.add(colMatch[1])
    }

    tables.set(tableName, cols)
  }

  return tables
}

// Parse ensure-schema.ts to find which columns are covered
function parseEnsureSchemaColumns(ensureSource: string): {
  alteredColumns: Map<string, Set<string>>
  createdTables: Map<string, Set<string>>
} {
  const alteredColumns = new Map<string, Set<string>>()
  const createdTables = new Map<string, Set<string>>()

  // Match ALTER TABLE <table> ADD <column>
  const alterRegex = /ALTER TABLE (\w+) ADD (?:COLUMN )?(\w+)/gi
  let match
  while ((match = alterRegex.exec(ensureSource)) !== null) {
    const table = match[1]
    const col = match[2]
    if (!alteredColumns.has(table)) alteredColumns.set(table, new Set())
    alteredColumns.get(table)!.add(col)
  }

  // Match CREATE TABLE IF NOT EXISTS <table> (...columns...)
  const createRegex = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\)\s*`\)/g
  while ((match = createRegex.exec(ensureSource)) !== null) {
    const table = match[1]
    const body = match[2]
    const cols = new Set<string>()

    // Extract column names from CREATE TABLE body
    // Each line like: column_name type ...
    const lines = body.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('FOREIGN') || trimmed.startsWith('PRIMARY') || trimmed.startsWith('UNIQUE') || trimmed.startsWith('--')) continue
      const colName = trimmed.split(/\s+/)[0]?.replace(/,$/,'')
      if (colName) cols.add(colName)
    }

    createdTables.set(table, cols)
  }

  return { alteredColumns, createdTables }
}

// Tables that exist from initial migration (before ensure-schema was created)
// These columns are part of the original CREATE TABLE and don't need ALTER TABLE statements
const INITIAL_TABLES: Record<string, Set<string>> = {
  users: new Set([
    'id', 'name', 'email', 'email_verified', 'image',
    'stripe_customer_id', 'subscription_id', 'subscription_status', 'tier', 'current_period_end',
    'byok_provider', 'byok_api_key', 'byok_model',
    'created_at', 'updated_at',
  ]),
  accounts: new Set([
    'user_id', 'type', 'provider', 'provider_account_id',
    'refresh_token', 'access_token', 'expires_at', 'token_type', 'scope', 'id_token', 'session_state',
  ]),
  sessions: new Set(['session_token', 'user_id', 'expires']),
  verification_tokens: new Set(['identifier', 'token', 'expires']),
  usage_records: new Set(['id', 'user_id', 'request_type', 'created_at']),
  channels: new Set([
    'id', 'owner_id', 'name', 'description', 'status',
    'ai_instructions', 'include_backside_in_ai', 'suggestion_mode',
    'property_definitions', 'tag_definitions', 'questions', 'instruction_history',
    'unlinked_task_order',
    'created_at', 'updated_at',
  ]),
  columns: new Set([
    'id', 'channel_id', 'name', 'instructions', 'processing_prompt', 'auto_process',
    'is_ai_target', 'position', 'created_at', 'updated_at',
  ]),
  cards: new Set([
    'id', 'channel_id', 'column_id', 'title', 'messages', 'summary', 'summary_updated_at',
    'source', 'properties', 'tags', 'position', 'is_archived',
    'hide_completed_tasks', 'created_by_instruction_id', 'processed_by_instructions',
    'spawned_channel_ids',
    'created_at', 'updated_at',
  ]),
  tasks: new Set([
    'id', 'channel_id', 'card_id', 'title', 'description', 'status',
    'assigned_to', 'due_date', 'completed_at', 'position',
    'created_at', 'updated_at',
  ]),
  instruction_cards: new Set([
    'id', 'channel_id', 'title', 'instructions', 'action', 'target', 'context_columns',
    'run_mode', 'card_count', 'interview_questions',
    'is_enabled', 'triggers', 'safeguards',
    'last_executed_at', 'next_scheduled_run',
    'daily_execution_count', 'daily_count_reset_at', 'execution_history',
    'position', 'created_at', 'updated_at',
  ]),
  folders: new Set([
    'id', 'user_id', 'name', 'is_collapsed', 'position', 'created_at', 'updated_at',
  ]),
  user_channel_org: new Set([
    'id', 'user_id', 'channel_id', 'folder_id', 'position', 'created_at',
  ]),
  channel_shares: new Set([
    'id', 'channel_id', 'user_id', 'email', 'role',
    'invited_by', 'invited_at', 'accepted_at', 'created_at',
  ]),
  channel_invite_links: new Set([
    'id', 'channel_id', 'token', 'default_role', 'requires_approval',
    'expires_at', 'max_uses', 'use_count', 'created_by', 'created_at',
  ]),
  instruction_runs: new Set([
    'id', 'channel_id', 'instruction_id', 'instruction_title',
    'changes', 'undone', 'timestamp',
  ]),
}

describe('Schema Migration Guard', () => {
  const schemaPath = path.resolve(__dirname, '../lib/db/schema.ts')
  const ensurePath = path.resolve(__dirname, '../lib/db/ensure-schema.ts')

  const schemaSource = fs.readFileSync(schemaPath, 'utf-8')
  const ensureSource = fs.readFileSync(ensurePath, 'utf-8')

  const schemaTables = parseSchemaColumns(schemaSource)
  const { alteredColumns, createdTables } = parseEnsureSchemaColumns(ensureSource)

  it('should parse at least 10 tables from schema.ts', () => {
    expect(schemaTables.size).toBeGreaterThanOrEqual(10)
  })

  it('should have migrations for every non-initial column', () => {
    const missing: string[] = []

    for (const [tableName, columns] of schemaTables) {
      const initialCols = INITIAL_TABLES[tableName] ?? new Set()
      const alteredCols = alteredColumns.get(tableName) ?? new Set()
      const createdCols = createdTables.get(tableName) ?? new Set()

      for (const col of columns) {
        // Column is covered if it's in the initial schema, an ALTER TABLE, or a CREATE TABLE IF NOT EXISTS
        const covered = initialCols.has(col) || alteredCols.has(col) || createdCols.has(col)
        if (!covered) {
          missing.push(`${tableName}.${col}`)
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing migrations in ensure-schema.ts for:\n` +
        missing.map(m => `  - ${m}`).join('\n') +
        `\n\nAdd ALTER TABLE statements to lib/db/ensure-schema.ts for each.`
      )
    }
  })

  it('should have ensure-schema.ts call ensured flag to prevent repeated runs', () => {
    expect(ensureSource).toContain('let ensured = false')
    expect(ensureSource).toContain('if (ensured) return')
    expect(ensureSource).toContain('ensured = true')
  })
})
