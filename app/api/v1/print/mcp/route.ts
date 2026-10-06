import { NextResponse } from 'next/server'
import { caller, unauthorized } from '@/lib/print/orders/api'
import { handleRpc } from '@/lib/print/orders/mcp'

/**
 * POST /api/v1/print/mcp — the print API as an MCP server (Streamable HTTP, stateless).
 *
 * Point any MCP client here with `Authorization: Bearer kp_live_…`. JSON in, JSON out;
 * there is no server-to-client stream, so GET answers 405 as the transport allows.
 */

export const maxDuration = 300

export async function POST(req: Request) {
  const who = await caller(req)
  if (!who) return unauthorized()
  const msg = await req.json().catch(() => null)
  if (!msg) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  if (Array.isArray(msg)) {
    const replies = (await Promise.all(msg.map((m) => handleRpc(who, m)))).filter(Boolean)
    return replies.length ? NextResponse.json(replies) : new Response(null, { status: 202 })
  }
  const reply = await handleRpc(who, msg)
  return reply ? NextResponse.json(reply) : new Response(null, { status: 202 })
}

export function GET() {
  return new Response('This MCP server answers POST only (no event stream).', { status: 405, headers: { Allow: 'POST' } })
}
