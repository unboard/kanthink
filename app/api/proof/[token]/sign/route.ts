import { NextResponse } from 'next/server'
import { isCloudinaryConfigured, signVideoUpload } from '@/lib/cloudinary'
import { jobByToken, orderOf, settleStatus } from '@/lib/print/orders/server'
import { isOpen } from '@/lib/print/orders/rules'

/**
 * POST /api/proof/:token/sign — lets the customer upload a replacement file straight to
 * storage, into a folder belonging to this one job, while the job is still open.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const job = await jobByToken(token)
  if (!job) return NextResponse.json({ error: { message: 'This link isn’t valid any more.' } }, { status: 404 })
  if (!isOpen(await settleStatus(job, await orderOf(job)))) return NextResponse.json({ error: { message: 'This job is past its deadline.' } }, { status: 409 })
  if (!isCloudinaryConfigured()) return NextResponse.json({ error: { message: 'File storage isn’t configured.' } }, { status: 500 })
  return NextResponse.json(signVideoUpload({ folder: `kanthink/print/${job.userId}/incoming/${job.id}` }))
}
