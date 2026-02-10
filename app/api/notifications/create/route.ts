import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications/createNotification'
import type { NotificationType } from '@/lib/notifications/types'

/**
 * POST /api/notifications/create
 * Create a notification (for client-side triggers like automation events)
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { type, title, body: notifBody, data } = body

  if (!type || !title || !notifBody) {
    return NextResponse.json(
      { error: 'type, title, and body are required' },
      { status: 400 }
    )
  }

  const success = await createNotification({
    userId: session.user.id,
    type: type as NotificationType,
    title,
    body: notifBody,
    data,
  })

  return NextResponse.json({ success }, { status: success ? 201 : 500 })
}
