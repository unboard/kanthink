import { NextResponse } from 'next/server'
import { OrderError, jobByToken, orderOf, type JobRow } from './server'
import { pageView } from './views'

/**
 * The customer's side of a job: everything goes through the job's token, which is the
 * only thing they hold. Each action returns the page as it now stands.
 */
export function proofAction(act: (job: JobRow, req: Request) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
    const { token } = await ctx.params
    const job = await jobByToken(token)
    if (!job) return NextResponse.json({ error: { message: 'This link isn’t valid any more.' } }, { status: 404 })
    try {
      await act(job, req)
      const fresh = (await jobByToken(token))!
      return NextResponse.json(await pageView(fresh, await orderOf(fresh), 'customer'))
    } catch (err) {
      if (err instanceof OrderError) return NextResponse.json({ error: { message: err.message, path: err.path } }, { status: err.status })
      console.error('[proof]', err)
      return NextResponse.json({ error: { message: 'Something went wrong. Try again.' } }, { status: 500 })
    }
  }
}
