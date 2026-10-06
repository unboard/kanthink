import { NextResponse } from 'next/server'
import { route } from '@/lib/print/orders/api'
import { eventsOp } from '@/lib/print/orders/ops'

/** GET /api/v1/print/jobs/:id/events — the job's timeline, oldest first. Same events the webhook sends. */

export const GET = route<{ id: string }>(async (_req, who, { id }) => NextResponse.json(await eventsOp(who, id)))
