import { NextResponse } from 'next/server'
import { OrderError, findJob, orderOf } from '@/lib/print/orders/server'
import { reviseJob, type ReviseAction } from '@/lib/print/orders/revise'
import { pageView } from '@/lib/print/orders/views'
import { printUser } from '@/lib/print/server/store'
import { RenderError } from '@/lib/print/server/pipeline'

/** POST /api/print/jobs/:id/revise { action: fit | fix | sharpen, page, prompt? } — the printer's one-click fixes. */

export const maxDuration = 300

const ACTIONS: ReviseAction[] = ['fit', 'fix', 'sharpen']

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  const { id } = await ctx.params
  const job = await findJob(userId, id)
  if (!job) return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; page?: number; prompt?: string }
  const action = ACTIONS.find((a) => a === b.action)
  if (!action) return NextResponse.json({ error: { message: 'action must be fit, fix or sharpen.' } }, { status: 422 })
  try {
    await reviseJob(job, action, Number(b.page) || 0, typeof b.prompt === 'string' ? b.prompt.slice(0, 1000) : undefined)
    return NextResponse.json(await pageView(job, await orderOf(job), 'printer'))
  } catch (err) {
    const status = err instanceof OrderError || err instanceof RenderError ? err.status : 500
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : 'That didn’t work.' } }, { status })
  }
}
