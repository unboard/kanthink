import { NextResponse } from 'next/server'
import { body, route } from '@/lib/print/orders/api'
import { sendProofOp } from '@/lib/print/orders/ops'

/**
 * POST /api/v1/print/jobs/:id/proof   { message?, changes?: [{ kind, text }], notify?: true }
 * Shows the customer the current version of every page and emails them the link.
 */

export const POST = route<{ id: string }>(async (req, who, { id }) => NextResponse.json(await sendProofOp(who, id, await body(req))))
