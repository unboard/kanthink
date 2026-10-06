import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { messageOp } from '@/lib/print/orders/ops'

/** POST /api/v1/print/jobs/:id/messages   { message } — posts to the job's timeline and emails the customer. */

export const POST = route<{ id: string }>(async (req, who, { id }) => NextResponse.json(await messageOp(who, id, (await body(req)).message)))
