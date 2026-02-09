import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { channels } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'

const DEPLOY_VERSION = '2026-02-08-v3'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ version: DEPLOY_VERSION, error: 'Not authenticated' }, { status: 401 })
    }

    const userId = session.user.id

    // Test 1: Simple query
    const channel = await db.query.channels.findFirst({
      where: eq(channels.ownerId, userId),
    })

    // Test 2: Count channels
    const allChannels = await db.query.channels.findMany({
      where: eq(channels.ownerId, userId),
      columns: { id: true, name: true },
    })

    return NextResponse.json({
      version: DEPLOY_VERSION,
      success: true,
      userId,
      channelCount: allChannels.length,
      channels: allChannels.map(c => ({ id: c.id, name: c.name })),
      firstChannel: channel ? { id: channel.id, name: channel.name } : null,
    })
  } catch (error) {
    return NextResponse.json({
      version: DEPLOY_VERSION,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
    }, { status: 500 })
  }
}
