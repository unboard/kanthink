/**
 * Debug endpoint to test database connection
 * DELETE THIS FILE after debugging is complete
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channels } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + '...',
      hasAuthToken: !!process.env.TURSO_AUTH_TOKEN,
      authTokenPrefix: process.env.TURSO_AUTH_TOKEN?.slice(0, 10) + '...',
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

  // Test 4: Try INSERT (this will test write permissions)
  try {
    // Insert and immediately delete a test record
    const testId = `test-${Date.now()}`
    await db.run(sql`INSERT INTO folders (id, user_id, name, position, created_at, updated_at) VALUES (${testId}, 'test-user', 'test-folder', 0, ${Date.now()}, ${Date.now()})`)
    await db.run(sql`DELETE FROM folders WHERE id = ${testId}`)
    diagnostics.writeTest = {
      success: true,
      message: 'INSERT and DELETE worked - token has write permissions',
    }
  } catch (error) {
    diagnostics.writeTest = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Token may be READ-ONLY. Create a new token with Full Access in Turso dashboard.',
    }
  }

  return NextResponse.json(diagnostics, { status: 200 })
}
