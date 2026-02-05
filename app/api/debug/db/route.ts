/**
 * Debug endpoint to test database connection
 * DELETE THIS FILE after debugging is complete
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channels } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { createClient } from '@libsql/client'

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + '...',
      hasAuthToken: !!process.env.TURSO_AUTH_TOKEN,
      authTokenLength: process.env.TURSO_AUTH_TOKEN?.length,
      authTokenLast10: '...' + process.env.TURSO_AUTH_TOKEN?.slice(-10),
    },
  }

  // Test 1: Simple query
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(channels)
    diagnostics.simpleQuery = {
      success: true,
      channelCount: result[0]?.count ?? 0,
    }
  } catch (error) {
    diagnostics.simpleQuery = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Test 2: Raw SQL query
  try {
    const result = await db.run(sql`SELECT 1 as test`)
    diagnostics.rawQuery = {
      success: true,
      result: result,
    }
  } catch (error) {
    diagnostics.rawQuery = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Test 3: List tables
  try {
    const result = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`)
    diagnostics.tables = {
      success: true,
      result: result,
    }
  } catch (error) {
    diagnostics.tables = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Test 4: Try INSERT with REAL user ID
  const realUserId = '8a42865c-80fc-49bc-8adf-5ee45cf6f44f'
  try {
    const testId = `test-folder-${Date.now()}`
    await db.run(sql`INSERT INTO folders (id, user_id, name, position, created_at, updated_at) VALUES (${testId}, ${realUserId}, 'test-folder', 0, ${Date.now()}, ${Date.now()})`)
    await db.run(sql`DELETE FROM folders WHERE id = ${testId}`)
    diagnostics.writeTestRealUser = {
      success: true,
      message: 'INSERT with real user ID WORKED!',
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; cause?: unknown }
    diagnostics.writeTestRealUser = {
      success: false,
      error: err.message || 'Unknown error',
    }
  }

  // Test 4b: Try INSERT into CHANNELS table with real user
  try {
    const testChannelId = `test-channel-${Date.now()}`
    await db.run(sql`INSERT INTO channels (id, owner_id, name, description, status, ai_instructions, created_at, updated_at) VALUES (${testChannelId}, ${realUserId}, 'Test Channel', 'test', 'active', '', ${Date.now()}, ${Date.now()})`)
    await db.run(sql`DELETE FROM channels WHERE id = ${testChannelId}`)
    diagnostics.writeTestChannel = {
      success: true,
      message: 'INSERT into CHANNELS table WORKED!',
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; cause?: unknown }
    diagnostics.writeTestChannel = {
      success: false,
      error: err.message || 'Unknown error',
    }
  }

  // Test 5: Check if user 8a42865c-80fc-49bc-8adf-5ee45cf6f44f exists
  try {
    const userResult = await db.run(sql`SELECT id, email FROM users WHERE id = '8a42865c-80fc-49bc-8adf-5ee45cf6f44f'`)
    diagnostics.userCheck = {
      success: true,
      result: userResult,
    }
  } catch (error: unknown) {
    diagnostics.userCheck = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Test 6: Count all users
  try {
    const usersResult = await db.run(sql`SELECT COUNT(*) as count FROM users`)
    diagnostics.usersCount = {
      success: true,
      result: usersResult,
    }
  } catch (error: unknown) {
    diagnostics.usersCount = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  return NextResponse.json(diagnostics, { status: 200 })
}
