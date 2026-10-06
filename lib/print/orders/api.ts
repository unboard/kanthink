import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { OrderError, userFromApiKey } from './server'
import type { EventActor } from './types'
import type { FieldError } from './rules'

/**
 * The door every /api/v1/print route goes through.
 *
 * One API serves outside systems (an API key), bots (the same key, over MCP) and the
 * studio's own pages (the signed-in session), so there is one set of rules for all of
 * them. Errors always come back as { error: { message, path?, fields? } }.
 */

export interface Caller {
  userId: string
  actor: EventActor
}

export async function caller(req: Request): Promise<Caller | null> {
  const header = req.headers.get('authorization')
  if (header) {
    const userId = await userFromApiKey(header)
    return userId ? { userId, actor: 'api' } : null
  }
  const session = await auth()
  if (!session?.user?.id) return null
  await ensureSchema()
  return { userId: session.user.id, actor: 'printer' }
}

export function apiError(message: string, status: number, extra: { path?: string; fields?: FieldError[] } = {}) {
  return NextResponse.json({ error: { message, ...extra } }, { status })
}

export const unauthorized = () =>
  apiError('Send an API key as `Authorization: Bearer kp_live_…` (make one at /print/developers), or sign in.', 401)

/** Run a handler as the caller, turning known failures into clean responses. */
export function route<P>(handler: (req: Request, who: Caller, params: P) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    const who = await caller(req)
    if (!who) return unauthorized()
    try {
      return await handler(req, who, await ctx.params)
    } catch (err) {
      if (err instanceof OrderError) return apiError(err.message, err.status, { path: err.path, fields: err.fields })
      console.error('[print api]', err)
      return apiError(err instanceof Error ? err.message : 'Something went wrong.', 500)
    }
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const json = await req.json().catch(() => null)
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new OrderError('The body must be a JSON object.', 400)
  return json as Record<string, unknown>
}
