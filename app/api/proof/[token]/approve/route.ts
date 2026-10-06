import { proofAction } from '@/lib/print/orders/proofRoute'
import { approveJob } from '@/lib/print/orders/server'

/** POST /api/proof/:token/approve { name? } */
export const POST = proofAction(async (job, req) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string }
  await approveJob(job, 'customer', typeof b.name === 'string' && b.name.trim() ? b.name.trim() : undefined)
})
