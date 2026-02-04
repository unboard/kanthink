import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { instructionCards } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

/**
 * GET /api/global-shrooms
 * Fetch all global resource shrooms (available to all authenticated users)
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Fetch global resource shrooms
    let globalShrooms: typeof instructionCards.$inferSelect[] = []
    try {
      globalShrooms = await db.query.instructionCards.findMany({
        where: eq(instructionCards.isGlobalResource, true),
        orderBy: [asc(instructionCards.title)],
      })
    } catch (e) {
      // Column may not exist yet - ignore
      console.warn('Could not fetch global shrooms:', e)
    }

    return NextResponse.json({
      instructionCards: globalShrooms.map(ic => ({
        ...ic,
        isGlobalResource: true,
        lastExecutedAt: ic.lastExecutedAt?.toISOString(),
        nextScheduledRun: ic.nextScheduledRun?.toISOString(),
        dailyCountResetAt: ic.dailyCountResetAt?.toISOString(),
        createdAt: ic.createdAt?.toISOString(),
        updatedAt: ic.updatedAt?.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching global shrooms:', error)
    return NextResponse.json({ error: 'Failed to fetch global shrooms' }, { status: 500 })
  }
}
