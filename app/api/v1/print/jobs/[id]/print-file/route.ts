import sharp from 'sharp'
import { apiError, route } from '@/lib/print/orders/api'
import { designOf, findJob, orderOf, settleStatus } from '@/lib/print/orders/server'
import { finalVersions } from '@/lib/print/orders/views'
import { buildPrintPdf } from '@/lib/print/pdf'
import { fetchOwnImage } from '@/lib/print/server/images'
import { bleedSize } from '@/lib/print/spec'

/**
 * GET /api/v1/print/jobs/:id/print-file?cropMarks=1
 *
 * The press PDF of the job's final pages — the approved or locked proof, else the
 * current versions — at full resolution, with TrimBox and BleedBox set; a side with no
 * artwork prints blank. The header
 * X-Print-Final says whether those pages are locked in (approved, locked or later).
 */

export const maxDuration = 120

export const GET = route<{ id: string }>(async (req, who, { id }) => {
  const job = await findJob(who.userId, id)
  if (!job) return apiError(`No job "${id}" on this account.`, 404)
  const status = await settleStatus(job, await orderOf(job))
  const design = await designOf(job)
  const finals = finalVersions(design, job)
  if (finals.every((v) => !v)) return apiError('There’s no artwork on this job yet.', 409)
  const sheet = bleedSize(design.spec)
  const pages = await Promise.all(
    finals.map(async (v) => {
      // A side with no artwork prints blank.
      if (!v) {
        const w = Math.round(sheet.w * 150)
        const h = Math.round(sheet.h * 150)
        const jpeg = await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).jpeg({ quality: 90 }).toBuffer()
        return { jpeg: new Uint8Array(jpeg), width: w, height: h }
      }
      const jpeg = await sharp(await fetchOwnImage(v.url)).removeAlpha().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
      return { jpeg: new Uint8Array(jpeg), width: v.width, height: v.height }
    }),
  )
  const cropMarks = new URL(req.url).searchParams.get('cropMarks') === '1'
  const pdf = buildPrintPdf(design.spec, pages, { cropMarks, title: `${job.name}` })
  const name = `${job.name}-${job.id}.pdf`.replace(/[^\w.-]+/g, '-').toLowerCase()
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'X-Print-Final': ['approved', 'locked', 'in_production', 'complete'].includes(status) ? 'true' : 'false',
    },
  })
})
