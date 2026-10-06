import { NextResponse } from 'next/server'
import { productsOp } from '@/lib/print/orders/ops'

/** GET /api/v1/print/products — the catalog keys an order can name, with their sizes. Public. */

export function GET() {
  return NextResponse.json(productsOp())
}
