import { proofAction } from '@/lib/print/orders/proofRoute'
import { addComment } from '@/lib/print/orders/server'

/** POST /api/proof/:token/message { message } */
export const POST = proofAction(async (job, req) => {
  const b = (await req.json().catch(() => ({}))) as { message?: string }
  await addComment(job, typeof b.message === 'string' ? b.message : '', 'customer')
})
