import { proofAction } from '@/lib/print/orders/proofRoute'
import { OrderError, addArtwork } from '@/lib/print/orders/server'

/**
 * POST /api/proof/:token/upload — a replacement file from the customer, which goes back
 * to the printer for review. Either:
 *   JSON { url, page?, filename? } — a file already uploaded to this job's folder (see /sign)
 *   multipart file (+ page)        — small files, under 4 MB
 */

export const maxDuration = 300

export const POST = proofAction(async (job, req) => {
  const origin = { via: 'upload' as const, madeBy: 'customer' as const }
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const b = (await req.json().catch(() => ({}))) as { url?: string; page?: string | number; filename?: string }
    // Only a file in this job's own upload folder: the token can't be used to fetch elsewhere.
    const cloud = process.env.CLOUDINARY_CLOUD_NAME
    const allowed = cloud && typeof b.url === 'string' && b.url.startsWith(`https://res.cloudinary.com/${cloud}/`) && b.url.includes(`/kanthink/print/${job.userId}/incoming/${job.id}/`)
    if (!allowed) throw new OrderError('Upload the file first.', 422, 'url')
    await addArtwork(job, [{ url: b.url!, page: b.page, filename: typeof b.filename === 'string' ? b.filename.slice(0, 200) : undefined, origin }], 'customer')
    return
  }
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw new OrderError('Choose a file to send.', 422, 'file')
  if (file.size > 4.2 * 1024 * 1024) throw new OrderError('That file is over 4 MB. Try again; large files upload directly.', 413, 'file')
  const page = form?.get('page')
  const url = `data:${file.type || 'application/octet-stream'};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
  await addArtwork(job, [{ url, filename: file.name, page: typeof page === 'string' ? page : undefined, origin }], 'customer')
})
