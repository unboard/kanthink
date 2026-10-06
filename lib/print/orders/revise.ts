import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { printDesigns } from '@/lib/db/schema'
import { preflight, render } from '../server/pipeline'
import { chargeRender, now } from '../server/store'
import type { PrintVersion, VersionMode } from '../types'
import type { Mark } from '../markup'
import { OrderError, designOf, orderOf, parseJson, recordEvent, settleStatus, type JobRow } from './server'
import { isOpen } from './rules'
import { REVISE_CHANGES, type ArtworkFile } from './types'

/**
 * The printer's one-click fixes on a job, run through the same pipeline as the studio.
 *
 *   fit     — rebuild the customer's whole original file on this product (recreate),
 *             keeping every word; for files that are the wrong shape
 *   fix     — move what the print check flagged inside the lines, run colour to the edge
 *   sharpen — redraw at full print resolution
 *
 * The result becomes the page's newest version and is checked straight away; it isn't
 * shown to the customer until the printer sends the proof.
 */

export type ReviseAction = 'fit' | 'fix' | 'sharpen' | 'marks'


export async function reviseJob(job: JobRow, action: ReviseAction, pageIndex: number, prompt?: string): Promise<PrintVersion> {
  const order = await orderOf(job)
  const status = await settleStatus(job, order)
  if (!isOpen(status)) throw new OrderError('This job is locked; its artwork can no longer change.', 409)
  const design = await designOf(job)
  const page = design.pages[pageIndex]
  if (!page) throw new OrderError('No such page.', 404)
  const source = page.versions[page.current]

  let mode: VersionMode
  let sentMarks: Mark[] = []
  let req: Parameters<typeof render>[0]
  if (action === 'fit') {
    const original = parseJson<ArtworkFile[]>(job.artwork, []).filter((a) => a.page === pageIndex).at(-1)
    if (!original) throw new OrderError('There’s no original file on this page to fit.', 409)
    mode = 'create'
    req = {
      userId: job.userId,
      design: { ...design, brief: { ...design.brief, prompt: '', images: [{ id: original.id, url: original.url, width: original.width, height: original.height, role: 'recreate' }] } },
      brand: null,
      pageIndex,
      mode,
      prompt: prompt || undefined,
    }
  } else if (action === 'marks') {
    // The customer's numbered marks, made as asked, through the same markup pipeline.
    if (!source) throw new OrderError('There’s no artwork on this page yet.', 409)
    sentMarks = (page.marks ?? []).filter((m) => m.status === 'open' && !m.hidden)
    if (!sentMarks.length) throw new OrderError('There are no open marks on this side.', 409)
    mode = 'markup'
    req = { userId: job.userId, design, brand: null, pageIndex, mode, source: { ...source, check: undefined }, marks: sentMarks, prompt: prompt || undefined }
  } else {
    if (!source) throw new OrderError('There’s no artwork on this page yet.', 409)
    mode = action === 'fix' ? 'fix' : 'upscale'
    const issues = (source.check?.issues ?? []).filter((i) => i.kind !== 'resolution')
    if (mode === 'fix' && !issues.length) throw new OrderError('The print check found nothing to fix on this page. Run the check again, or use Fit to product.', 409)
    req = { userId: job.userId, design, brand: null, pageIndex, mode, source: { ...source, check: undefined }, issues: mode === 'fix' ? issues : undefined }
  }

  const { version, cents } = await render(req)
  await chargeRender(job.userId, design.id, cents)
  const check = await preflight(job.userId, design, version, null).catch(() => null)
  const placed: PrintVersion = { ...version, check: check ?? undefined }

  // Re-read: the printer may have the studio open on the same design.
  const fresh = await designOf(job)
  // Marks that were made step back, keeping a note of the version they went into.
  const sent = new Set(sentMarks.map((m) => m.id))
  const pages = fresh.pages.map((p, i) =>
    i === pageIndex
      ? {
          ...p,
          versions: [...p.versions, placed],
          current: p.versions.length,
          marks: (p.marks ?? []).map((m) => (sent.has(m.id) ? { ...m, hidden: true, sentIn: [...(m.sentIn ?? []), placed.id] } : m)),
        }
      : p,
  )
  await db.update(printDesigns).set({ pages: JSON.stringify(pages), updatedAt: now() }).where(eq(printDesigns.id, design.id))
  await recordEvent(job, 'printer', 'revised', `${REVISE_CHANGES[action].text} (${page.label}).`, { action, page: pageIndex, versionId: placed.id })
  return placed
}
