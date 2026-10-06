import { NextResponse } from 'next/server'
import { findJob, orderOf } from '@/lib/print/orders/server'
import { printUser } from '@/lib/print/server/store'
import { pageView } from '@/lib/print/orders/views'

/** GET /api/print/jobs/:id — the job's shared page, as the printer sees it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  const { id } = await ctx.params
  const job = await findJob(userId, id)
  if (!job) return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 })
  return NextResponse.json(await pageView(job, await orderOf(job), 'printer'))
}
