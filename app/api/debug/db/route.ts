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

  // Test 4: Try INSERT using regional URL
  const regionalUrl = process.env.DATABASE_URL!
  try {
    const directClient = createClient({
      url: regionalUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })

    const testId = `test-${Date.now()}`
    await directClient.execute({
      sql: 'INSERT INTO folders (id, user_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [testId, 'test-user', 'test-folder', 0, Date.now(), Date.now()]
    })
    await directClient.execute({
      sql: 'DELETE FROM folders WHERE id = ?',
      args: [testId]
    })
    diagnostics.writeTestRegional = {
      success: true,
      url: regionalUrl.slice(0, 40) + '...',
      message: 'Write works with regional URL',
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; cause?: unknown }
    diagnostics.writeTestRegional = {
      success: false,
      url: regionalUrl.slice(0, 40) + '...',
      error: err.message || 'Unknown error',
    }
  }

  // Test 5: Try INSERT using PRIMARY URL (without region)
  // Convert libsql://kanthink-unboard.aws-us-east-2.turso.io to libsql://kanthink-unboard.turso.io
  const primaryUrl = regionalUrl.replace(/\.(aws|gcp|azure)-[^.]+\./, '.')
  if (primaryUrl !== regionalUrl) {
    try {
      const primaryClient = createClient({
        url: primaryUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })

      const testId = `test-primary-${Date.now()}`
      await primaryClient.execute({
        sql: 'INSERT INTO folders (id, user_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [testId, 'test-user', 'test-folder', 0, Date.now(), Date.now()]
      })
      await primaryClient.execute({
        sql: 'DELETE FROM folders WHERE id = ?',
        args: [testId]
      })
      diagnostics.writeTestPrimary = {
        success: true,
        url: primaryUrl.slice(0, 40) + '...',
        message: 'Write works with PRIMARY URL! Update DATABASE_URL in Vercel to this.',
        recommendedUrl: primaryUrl,
      }
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; cause?: unknown }
      diagnostics.writeTestPrimary = {
        success: false,
        url: primaryUrl.slice(0, 40) + '...',
        error: err.message || 'Unknown error',
      }
    }
  }

  return NextResponse.json(diagnostics, { status: 200 })
}
