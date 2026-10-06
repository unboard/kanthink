import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { createOrderOp, listOrdersOp } from '@/lib/print/orders/ops'

/**
 * GET  /api/v1/print/orders?limit=&since=   — orders, newest first (jobs not expanded)
 * POST /api/v1/print/orders                  — create an order and its jobs
 *
 * Creating is idempotent on externalId: the same externalId returns the order already
 * made (200) instead of a second one (201). See /print/developers for the payload.
 */

export const maxDuration = 300

export const GET = route(async (req, who) => {
  const url = new URL(req.url)
  return NextResponse.json(await listOrdersOp(who, { limit: Number(url.searchParams.get('limit')) || undefined, since: url.searchParams.get('since') ?? undefined }))
})

export const POST = route(async (req, who) => {
  const result = await createOrderOp(who, await body(req), who.actor === 'api' ? 'api' : 'studio')
  return NextResponse.json(result.order, { status: result.created ? 201 : 200 })
})
