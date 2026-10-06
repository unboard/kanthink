import { createHash, randomBytes } from 'crypto'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { printApiKeys, printDesigns, printJobEvents, printJobs, printOrders, printPartners, users } from '@/lib/db/schema'
import { afterResponse } from '@/lib/afterResponse'
import { cleanMarks, nextNumber, type Mark } from '../markup'
import { artworkImages, loadArtwork, placeArtwork, type ArtworkFit } from '../server/artwork'
import { now, toDesign } from '../server/store'
import { catalogProduct, specWithPageCount } from '../spec'
import { DEFAULT_BRIEF, type PrintDesign, type PrintPage, type PrintSpec, type PrintVersion } from '../types'
import { effectiveStatus, lockAtFor, pageFor, signWebhook, specForProduct, type ArtworkInput, type FieldError, type OrderInput } from './rules'
import type { ArtworkFile, Customer, EventActor, EventType, JobEvent, JobProof, JobStatus, Offer, PartnerBrand, ProofChange } from './types'

/**
 * Orders and jobs in the database, and everything that happens to them.
 *
 * Each write records an event; each event is the timeline entry both sides read and a
 * webhook to the printer's system. Customers act through a job's token and never see
 * anything else of the printer's account.
 */

export class OrderError extends Error {
  constructor(message: string, readonly status = 400, readonly path?: string, readonly fields?: FieldError[]) {
    super(message)
  }
}

export const baseUrl = () => (process.env.NEXTAUTH_URL || 'https://www.kanthink.com').replace(/\/$/, '')
const token = () => randomBytes(16).toString('base64url')
const parse = <T,>(text: string | null | undefined, fallback: T): T => {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export type OrderRow = typeof printOrders.$inferSelect
export type JobRow = typeof printJobs.$inferSelect

// ---------------------------------------------------------------------------
// Printer settings
// ---------------------------------------------------------------------------

export interface Partner {
  brand: PartnerBrand
  webhookUrl: string | null
  webhookSecret: string | null
  approvalHours: number
}

export async function getPartner(userId: string): Promise<Partner> {
  const row = await db.query.printPartners.findFirst({ where: eq(printPartners.userId, userId) })
  return {
    brand: parse<PartnerBrand>(row?.brand, {}),
    webhookUrl: row?.webhookUrl ?? null,
    webhookSecret: row?.webhookSecret ?? null,
    approvalHours: row?.approvalHours ?? 24,
  }
}

export async function savePartner(userId: string, patch: Partial<Omit<Partner, 'webhookSecret'>> & { rotateSecret?: boolean }): Promise<Partner> {
  const current = await getPartner(userId)
  const next = {
    brand: JSON.stringify({ ...current.brand, ...(patch.brand ?? {}) }),
    webhookUrl: patch.webhookUrl === undefined ? current.webhookUrl : patch.webhookUrl || null,
    webhookSecret: patch.rotateSecret || (!current.webhookSecret && patch.webhookUrl) ? `whsec_${randomBytes(24).toString('base64url')}` : current.webhookSecret,
    approvalHours: patch.approvalHours ?? current.approvalHours,
    updatedAt: now(),
  }
  await db
    .insert(printPartners)
    .values({ userId, ...next, createdAt: now() })
    .onConflictDoUpdate({ target: printPartners.userId, set: next })
  return getPartner(userId)
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** A new key. Returned once; only its hash is kept. */
export async function issueApiKey(userId: string, label?: string): Promise<{ id: string; key: string; prefix: string }> {
  const key = `kp_live_${randomBytes(24).toString('base64url')}`
  const id = nanoid(12)
  await db.insert(printApiKeys).values({ id, userId, keyHash: hashKey(key), prefix: key.slice(0, 12), label: label?.slice(0, 60) || 'API key', createdAt: now() })
  return { id, key, prefix: key.slice(0, 12) }
}

export async function listApiKeys(userId: string) {
  const rows = await db.query.printApiKeys.findMany({ where: and(eq(printApiKeys.userId, userId), isNull(printApiKeys.revokedAt)), orderBy: [desc(printApiKeys.createdAt)] })
  return rows.map((r) => ({ id: r.id, prefix: r.prefix, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }))
}

export async function revokeApiKey(userId: string, id: string) {
  await db.update(printApiKeys).set({ revokedAt: now() }).where(and(eq(printApiKeys.id, id), eq(printApiKeys.userId, userId)))
}

/** The account a request's key belongs to: `Authorization: Bearer kp_live_…`. */
export async function userFromApiKey(header: string | null): Promise<string | null> {
  const key = header?.match(/^Bearer\s+(kp_live_[A-Za-z0-9_-]{20,})\s*$/)?.[1]
  if (!key) return null
  await ensureSchema()
  const row = await db.query.printApiKeys.findFirst({ where: and(eq(printApiKeys.keyHash, hashKey(key)), isNull(printApiKeys.revokedAt)) })
  if (!row) return null
  await db.update(printApiKeys).set({ lastUsedAt: now() }).where(eq(printApiKeys.id, row.id))
  return row.userId
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function findOrder(userId: string, idOrExternal: string): Promise<OrderRow | null> {
  return (
    (await db.query.printOrders.findFirst({ where: and(eq(printOrders.userId, userId), eq(printOrders.id, idOrExternal)) })) ??
    (await db.query.printOrders.findFirst({ where: and(eq(printOrders.userId, userId), eq(printOrders.externalId, idOrExternal)) })) ??
    null
  )
}

export async function findJob(userId: string, idOrExternal: string): Promise<JobRow | null> {
  return (
    (await db.query.printJobs.findFirst({ where: and(eq(printJobs.userId, userId), eq(printJobs.id, idOrExternal)) })) ??
    (await db.query.printJobs.findFirst({ where: and(eq(printJobs.userId, userId), eq(printJobs.externalId, idOrExternal)) })) ??
    null
  )
}

export async function jobByToken(t: string): Promise<JobRow | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(t)) return null
  await ensureSchema()
  return (await db.query.printJobs.findFirst({ where: eq(printJobs.token, t) })) ?? null
}

export async function orderByToken(t: string): Promise<OrderRow | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(t)) return null
  await ensureSchema()
  return (await db.query.printOrders.findFirst({ where: eq(printOrders.token, t) })) ?? null
}

export async function orderOf(job: JobRow): Promise<OrderRow> {
  const order = await db.query.printOrders.findFirst({ where: eq(printOrders.id, job.orderId) })
  if (!order) throw new OrderError('Order not found', 404)
  return order
}

export async function jobsOf(orderId: string): Promise<JobRow[]> {
  return db.query.printJobs.findMany({ where: eq(printJobs.orderId, orderId), orderBy: [asc(printJobs.position)] })
}

export async function designOf(job: JobRow): Promise<PrintDesign> {
  const row = await db.query.printDesigns.findFirst({ where: eq(printDesigns.id, job.designId) })
  if (!row) throw new OrderError('This job’s artwork is missing.', 404)
  return toDesign(row)
}

export async function eventsOf(jobId: string): Promise<JobEvent[]> {
  const rows = await db.query.printJobEvents.findMany({ where: eq(printJobEvents.jobId, jobId), orderBy: [asc(printJobEvents.createdAt)] })
  return rows.map((r) => ({ id: r.id, actor: r.actor as EventActor, type: r.type, message: r.message ?? undefined, data: parse(r.data, undefined), at: r.createdAt ?? 0 }))
}

export async function listOrders(userId: string, opts: { limit?: number; since?: number } = {}): Promise<OrderRow[]> {
  const rows = await db.query.printOrders.findMany({ where: eq(printOrders.userId, userId), orderBy: [desc(printOrders.createdAt)], limit: Math.min(200, opts.limit ?? 100) })
  return opts.since ? rows.filter((r) => (r.updatedAt ?? 0) >= opts.since!) : rows
}

/** The job's status now, closing it if its deadline has passed since it was last read. */
export async function settleStatus(job: JobRow, order: OrderRow): Promise<JobStatus> {
  const stored = job.status as JobStatus
  const status = effectiveStatus(stored, lockAtFor(job, order), now())
  if (status !== stored) {
    await db.update(printJobs).set({ status, updatedAt: now() }).where(eq(printJobs.id, job.id))
    job.status = status
    await recordEvent(job, 'system', 'locked', 'The deadline passed. This version is final and goes to print.')
  }
  return status
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

interface PlacedFile {
  file: ArtworkFile
  version: PrintVersion
  fit: ArtworkFit
}

/** Fetch, read and place every artwork file for a spec. Fails with the field at fault. */
async function placeAll(userId: string, spec: PrintSpec, inputs: ArtworkInput[], path: string): Promise<PlacedFile[]> {
  const labels = spec.pages.map((p) => p.label)
  const taken = new Set<number>()
  const placed: PlacedFile[] = []
  for (const [k, a] of inputs.entries()) {
    const at = `${path}[${k}]`
    let images: { buffer: Buffer; format: string }[]
    try {
      const { data, type } = await loadArtwork(a.url)
      images = await artworkImages(data, type, spec)
    } catch (err) {
      throw new OrderError(`${at}: ${err instanceof Error ? err.message : 'couldn’t read that file'}`, 422, `${at}.url`)
    }
    // A multi-page PDF fills consecutive pages from where it was pointed.
    let page = pageFor(a.page, labels, taken)
    for (const img of images) {
      if (page >= labels.length) break
      const p = await placeArtwork(userId, spec, img.buffer, img.format)
      taken.add(page)
      placed.push({
        version: p.version,
        fit: p.fit,
        file: {
          id: nanoid(10),
          url: p.stored.url,
          sourceUrl: a.url.startsWith('data:') ? undefined : a.url.slice(0, 2000),
          filename: a.filename,
          page,
          width: p.stored.width,
          height: p.stored.height,
          format: p.format,
          origin: a.origin,
          at: now(),
        },
      })
      page++
    }
  }
  return placed
}

function pagesWith(spec: PrintSpec, existing: PrintPage[] | null, placed: PlacedFile[]): PrintPage[] {
  const pages: PrintPage[] = existing ?? spec.pages.map((p) => ({ id: nanoid(8), label: p.label, versions: [], current: 0 }))
  return pages.map((p, i) => {
    const mine = placed.filter((x) => x.file.page === i)
    if (!mine.length) return p
    const versions = [...p.versions, ...mine.map((m) => m.version)]
    return { ...p, versions, current: versions.length - 1 }
  })
}

// Every file's fit, including the clean ones, so a good replacement clears an old warning.
const fitNote = (placed: PlacedFile[]) =>
  placed.map((p) => ({ page: p.file.page, kind: p.fit.kind, loss: Math.round(p.fit.loss * 100) / 100, message: p.fit.message }))

/**
 * Create an order and its jobs. Sending the same externalId again returns the order
 * already made, so a retried request never makes two.
 */
export async function createOrder(userId: string, input: OrderInput, source: 'studio' | 'api' | 'mcp'): Promise<{ order: OrderRow; jobs: JobRow[]; created: boolean }> {
  await ensureSchema()
  if (input.externalId) {
    const existing = await db.query.printOrders.findFirst({ where: and(eq(printOrders.userId, userId), eq(printOrders.externalId, input.externalId)) })
    if (existing) return { order: existing, jobs: await jobsOf(existing.id), created: false }
  }

  // All the slow, fallible work first, so a bad file fails the request cleanly.
  const prepared: { input: OrderInput['jobs'][number]; spec: PrintSpec; placed: PlacedFile[] }[] = []
  for (const [i, j] of input.jobs.entries()) {
    const built = specForProduct(j.product)
    if ('error' in built) throw new OrderError(built.error, 422, `jobs[${i}].product`)
    let spec = built.spec
    const placed = await placeAll(userId, spec, j.artwork, `jobs[${i}].artwork`)
    // No side count given: a product sold one- or two-sided has as many sides as the artwork covers.
    const options = j.product.key ? catalogProduct(String(j.product.key))?.pageOptions : undefined
    const used = placed.length ? Math.max(...placed.map((p) => p.file.page)) + 1 : spec.pages.length
    if (j.product.pages === undefined && options?.includes(used) && used < spec.pages.length) spec = specWithPageCount(spec, used)
    prepared.push({ input: j, spec, placed })
  }

  const t = now()
  const order: OrderRow = {
    id: nanoid(12),
    userId,
    externalId: input.externalId ?? null,
    ref: input.ref ?? null,
    source,
    token: token(),
    customer: JSON.stringify(input.customer),
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    offer: input.offer ? JSON.stringify(input.offer) : null,
    lockAt: input.lockAt ?? null,
    createdAt: t,
    updatedAt: t,
  }
  await db.insert(printOrders).values(order)

  const jobs: JobRow[] = []
  for (const [i, p] of prepared.entries()) {
    const jobId = nanoid(12)
    const designId = crypto.randomUUID()
    const { product } = p.input
    await db.insert(printDesigns).values({
      id: designId,
      userId,
      name: [input.ref, p.input.name].filter(Boolean).join(' · ') || p.input.name,
      spec: JSON.stringify(p.spec),
      brief: JSON.stringify({ ...DEFAULT_BRIEF, prompt: p.input.notes }),
      pages: JSON.stringify(pagesWith(p.spec, null, p.placed)),
      jobId,
      createdAt: t,
      updatedAt: t,
    })
    const job: JobRow = {
      id: jobId,
      orderId: order.id,
      userId,
      designId,
      externalId: p.input.externalId ?? null,
      position: i,
      name: p.input.name,
      quantity: p.input.quantity ?? null,
      product: JSON.stringify(product),
      artwork: JSON.stringify(p.placed.map((x) => x.file)),
      token: token(),
      status: 'received',
      proof: null,
      approvedAt: null,
      approvedBy: null,
      lockAt: p.input.lockAt ?? null,
      createdAt: t,
      updatedAt: t,
    }
    await db.insert(printJobs).values(job)
    jobs.push(job)
    await recordEvent(job, source === 'studio' ? 'printer' : 'api', 'created', p.input.notes ? `Order received. Note: ${p.input.notes}` : 'Order received.', {
      files: p.placed.length,
      fit: fitNote(p.placed),
    })
  }

  afterResponse(async () => {
    for (const job of jobs) await checkJob(job).catch((e) => console.error('[print orders] check failed', e))
    if (input.notifyCustomer) await emailCustomer(order, jobs, 'received').catch((e) => console.error('[print orders] email failed', e))
  })
  return { order, jobs, created: true }
}

/** Run the print check on every page's current version, as the printer. */
export async function checkJob(job: JobRow): Promise<void> {
  const { preflight } = await import('../server/pipeline')
  const design = await designOf(job)
  const issues: string[] = []
  const pages = [...design.pages]
  for (const [i, page] of pages.entries()) {
    const v = page.versions[page.current]
    if (!v || v.check) continue
    const check = await preflight(job.userId, design, v, null).catch(() => null)
    if (!check) continue
    pages[i] = { ...page, versions: page.versions.map((x) => (x.id === v.id ? { ...x, check } : x)) }
    for (const issue of check.issues) issues.push(`${page.label}: ${issue.message}`)
  }
  await db.update(printDesigns).set({ pages: JSON.stringify(pages), updatedAt: now() }).where(eq(printDesigns.id, design.id))
  await recordEvent(job, 'system', 'checked', issues.length ? `Print check found ${issues.length} thing${issues.length === 1 ? '' : 's'} to look at.` : 'Print check passed.', { issues: issues.slice(0, 20) })
}

/** New artwork for a job, from the customer, the printer or the API. */
export async function addArtwork(job: JobRow, inputs: ArtworkInput[], actor: EventActor): Promise<JobRow> {
  const order = await orderOf(job)
  const status = await settleStatus(job, order)
  if (actor === 'customer' && !['received', 'awaiting_approval', 'changes_requested', 'approved'].includes(status)) {
    throw new OrderError('This job is past its deadline and can no longer change.', 409)
  }
  const design = await designOf(job)
  const placed = await placeAll(job.userId, design.spec, inputs, 'artwork')
  if (!placed.length) throw new OrderError('No artwork in that request.', 422, 'artwork')
  await db.update(printDesigns).set({ pages: JSON.stringify(pagesWith(design.spec, design.pages, placed)), updatedAt: now() }).where(eq(printDesigns.id, design.id))
  const files = [...parse<ArtworkFile[]>(job.artwork, []), ...placed.map((p) => p.file)]
  // New artwork from the customer is something the printer has to look at again.
  const nextStatus: JobStatus = actor === 'customer' || status === 'approved' ? 'received' : status
  await db.update(printJobs).set({ artwork: JSON.stringify(files), status: nextStatus, approvedAt: nextStatus === 'received' ? null : job.approvedAt, updatedAt: now() }).where(eq(printJobs.id, job.id))
  const updated = { ...job, artwork: JSON.stringify(files), status: nextStatus }
  await recordEvent(updated, actor, 'artwork_added', actor === 'customer' ? 'A new file was sent for this job.' : 'New artwork added.', { files: placed.length, fit: fitNote(placed) })
  afterResponse(async () => {
    await checkJob(updated).catch(() => {})
    if (actor === 'customer') await alertPrinter(updated, order, 'sent a new file').catch(() => {})
  })
  return updated
}

// ---------------------------------------------------------------------------
// The proof, and what each side does with it
// ---------------------------------------------------------------------------

/** Show the customer the current version of every page, with what changed and why. */
export async function sendProof(job: JobRow, opts: { message?: string; changes?: ProofChange[]; notify?: boolean }, actor: EventActor = 'printer'): Promise<JobRow> {
  const order = await orderOf(job)
  const status = await settleStatus(job, order)
  if (!['received', 'awaiting_approval', 'changes_requested', 'approved'].includes(status)) throw new OrderError('This job is locked; its proof can no longer change.', 409)
  const design = await designOf(job)
  const versions = design.pages.map((p) => p.versions[p.current]?.id ?? null)
  if (!versions.some(Boolean)) throw new OrderError('There’s no artwork to show yet.', 409)
  const proof: JobProof = { versions, message: opts.message?.slice(0, 2000) || undefined, changes: (opts.changes ?? []).slice(0, 20), sentAt: now() }
  await db.update(printJobs).set({ proof: JSON.stringify(proof), status: 'awaiting_approval', approvedAt: null, approvedBy: null, updatedAt: now() }).where(eq(printJobs.id, job.id))
  const updated = { ...job, proof: JSON.stringify(proof), status: 'awaiting_approval' }
  await recordEvent(updated, actor, 'proof_sent', proof.message ?? 'Your proof is ready to review.', { changes: proof.changes })
  if (opts.notify !== false) afterResponse(() => emailCustomer(order, [updated], 'proof'))
  return updated
}

export async function approveJob(job: JobRow, actor: EventActor, by?: string): Promise<JobRow> {
  const order = await orderOf(job)
  const status = await settleStatus(job, order)
  if (!['awaiting_approval', 'changes_requested', 'received'].includes(status)) {
    throw new OrderError(status === 'approved' ? 'Already approved.' : 'This job can no longer be approved here.', 409)
  }
  if (actor === 'customer' && !job.proof) throw new OrderError('There’s no proof to approve yet.', 409)
  await db.update(printJobs).set({ status: 'approved', approvedAt: now(), approvedBy: by?.slice(0, 120) ?? actor, updatedAt: now() }).where(eq(printJobs.id, job.id))
  const updated = { ...job, status: 'approved', approvedAt: now() }
  await recordEvent(updated, actor, 'approved', by ? `Approved by ${by}.` : 'Approved.')
  if (actor === 'customer') afterResponse(() => alertPrinter(updated, order, 'approved the proof'))
  return updated
}

/** The customer asks for something, in words and optionally numbered marks on a page. */
export async function requestChanges(job: JobRow, opts: { note: string; marks?: { page: number; marks: unknown }[]; by?: string }, actor: EventActor): Promise<JobRow> {
  const order = await orderOf(job)
  const status = await settleStatus(job, order)
  if (!['received', 'awaiting_approval', 'changes_requested', 'approved'].includes(status)) throw new OrderError('This job is past its deadline and can no longer change.', 409)
  const note = opts.note.trim().slice(0, 2000)
  let markCount = 0
  const markNotes: string[] = []
  if (opts.marks?.length) {
    const design = await designOf(job)
    const pages = design.pages.map((p, i) => {
      const incoming = cleanMarks(opts.marks!.find((m) => m.page === i)?.marks, 30)
      if (!incoming.length) return p
      const existing: Mark[] = p.marks ?? []
      let n = nextNumber(existing)
      const added = incoming.map((m) => ({ ...m, id: nanoid(8), n: n++, status: 'open' as const, hidden: false, by: `customer${opts.by ? `:${opts.by.slice(0, 60)}` : ''}`, versionId: p.versions[p.current]?.id, at: now() }))
      markCount += added.length
      for (const m of added) if (m.note.trim()) markNotes.push(`${m.n}. ${m.note.trim()}`)
      return { ...p, marks: [...existing, ...added] }
    })
    await db.update(printDesigns).set({ pages: JSON.stringify(pages), updatedAt: now() }).where(eq(printDesigns.id, design.id))
  }
  if (!note && !markCount) throw new OrderError('Say what you’d like changed.', 422, 'note')
  await db.update(printJobs).set({ status: 'changes_requested', approvedAt: null, updatedAt: now() }).where(eq(printJobs.id, job.id))
  const updated = { ...job, status: 'changes_requested', approvedAt: null }
  // The timeline quotes what was asked, the note and each mark's own note.
  const said = [note, ...markNotes].filter(Boolean).join('\n') || `${markCount} mark${markCount === 1 ? '' : 's'} on the page.`
  await recordEvent(updated, actor, 'changes_requested', said, { marks: markCount, by: opts.by })
  if (actor === 'customer') afterResponse(() => alertPrinter(updated, order, 'asked for a change'))
  return updated
}

export async function addComment(job: JobRow, message: string, actor: EventActor): Promise<void> {
  const text = message.trim().slice(0, 2000)
  if (!text) throw new OrderError('Write a message.', 422, 'message')
  await recordEvent(job, actor, 'comment', text)
  const order = await orderOf(job)
  afterResponse(() => (actor === 'customer' ? alertPrinter(job, order, 'sent a message') : emailCustomer(order, [job], 'message', text)))
}

export async function setJobStatus(job: JobRow, status: JobStatus, actor: EventActor): Promise<JobRow> {
  if (status === job.status) return job
  // Reopening after the deadline would close again on the next read: give it a fresh window.
  let lockAt = job.lockAt
  if (status === 'received') {
    const order = await orderOf(job)
    const due = lockAtFor(job, order)
    if (due !== null && due <= now()) lockAt = now() + (await getPartner(job.userId)).approvalHours * 3600
  }
  await db.update(printJobs).set({ status, lockAt, updatedAt: now() }).where(eq(printJobs.id, job.id))
  const updated = { ...job, status, lockAt }
  await recordEvent(updated, actor, status === 'locked' ? 'locked' : 'status_changed', status === 'locked' ? 'Locked for print. This version is final.' : undefined, { status })
  return updated
}

export async function setDeadline(target: { order?: OrderRow; job?: JobRow }, lockAt: number | null, actor: EventActor): Promise<void> {
  if (target.job) {
    await db.update(printJobs).set({ lockAt, updatedAt: now() }).where(eq(printJobs.id, target.job.id))
    await recordEvent(target.job, actor, 'deadline_changed', undefined, { lockAt })
  } else if (target.order) {
    await db.update(printOrders).set({ lockAt, updatedAt: now() }).where(eq(printOrders.id, target.order.id))
    for (const j of await jobsOf(target.order.id)) await recordEvent(j, actor, 'deadline_changed', undefined, { lockAt })
  }
}

// ---------------------------------------------------------------------------
// Events and webhooks
// ---------------------------------------------------------------------------

export async function recordEvent(job: JobRow, actor: EventActor, type: EventType, message?: string, data?: Record<string, unknown>): Promise<JobEvent> {
  const event: JobEvent = { id: nanoid(12), actor, type, message, data, at: now() }
  await db.insert(printJobEvents).values({
    id: event.id,
    jobId: job.id,
    orderId: job.orderId,
    userId: job.userId,
    actor,
    type,
    message: message ?? null,
    data: data ? JSON.stringify(data) : null,
    createdAt: event.at,
  })
  await db.update(printOrders).set({ updatedAt: event.at }).where(eq(printOrders.id, job.orderId))
  afterResponse(() => deliverWebhook(job, event))
  return event
}

/**
 * POST the event to the printer's webhook, signed. One attempt with a short timeout:
 * a receiver that misses one can read the job's events from the API.
 */
async function deliverWebhook(job: JobRow, event: JobEvent): Promise<void> {
  const partner = await getPartner(job.userId)
  if (!partner.webhookUrl || !partner.webhookSecret) return
  const fresh = (await db.query.printJobs.findFirst({ where: eq(printJobs.id, job.id) })) ?? job
  const order = await orderOf(fresh)
  const { apiJob } = await import('./views')
  const body = JSON.stringify({
    id: event.id,
    type: `job.${event.type}`,
    createdAt: new Date(event.at * 1000).toISOString(),
    data: { event, job: await apiJob(fresh, order), order: { id: order.id, externalId: order.externalId, ref: order.ref } },
  })
  const ts = now()
  try {
    const res = await fetch(partner.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Kanthink-Signature': signWebhook(partner.webhookSecret, body, ts), 'User-Agent': 'Kanthink-Webhooks/1' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.warn(`[print orders] webhook ${partner.webhookUrl} answered ${res.status}`)
  } catch (err) {
    console.warn('[print orders] webhook failed:', err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Telling people
// ---------------------------------------------------------------------------

async function emailCustomer(order: OrderRow, jobs: JobRow[], kind: 'received' | 'proof' | 'message', text?: string): Promise<void> {
  const customer = parse<Customer>(order.customer, {})
  if (!customer.email) return
  const partner = await getPartner(order.userId)
  const { customerEmail } = await import('./emails')
  const { sendTransactionalEmail } = await import('@/lib/customerio')
  const mail = customerEmail({ kind, order, jobs, customer, brand: partner.brand, baseUrl: baseUrl(), text })
  await sendTransactionalEmail({ to: customer.email, subject: mail.subject, html: mail.html, replyTo: partner.brand.email ?? null })
}

async function alertPrinter(job: JobRow, order: OrderRow, what: string): Promise<void> {
  const customer = parse<Customer>(order.customer, {})
  const who = customer.name || customer.email || 'The customer'
  const link = `${baseUrl()}/print/jobs/${job.id}`
  const { createNotification } = await import('@/lib/notifications/createNotification')
  await createNotification({
    userId: job.userId,
    type: 'print_job',
    title: `${who} ${what}`,
    body: `${order.ref ? `Order ${order.ref} · ` : ''}${job.name}`,
    data: { jobId: job.id, orderId: order.id, url: `/print/jobs/${job.id}` },
  }).catch(() => {})
  const owner = await db.query.users.findFirst({ where: eq(users.id, job.userId), columns: { email: true } })
  if (!owner?.email) return
  const { printerEmail } = await import('./emails')
  const { sendTransactionalEmail } = await import('@/lib/customerio')
  const mail = printerEmail({ who, what, job, order, link })
  await sendTransactionalEmail({ to: owner.email, subject: mail.subject, html: mail.html })
}

// ---------------------------------------------------------------------------
// Deadlines, swept
// ---------------------------------------------------------------------------

/** Lock every open job whose deadline has passed, so webhooks fire close to the time. */
export async function sweepDeadlines(): Promise<number> {
  await ensureSchema()
  const t = now()
  const open = await db.query.printJobs.findMany({ where: inArray(printJobs.status, ['received', 'awaiting_approval', 'changes_requested', 'approved']), limit: 500 })
  let locked = 0
  for (const job of open) {
    const order = await orderOf(job).catch(() => null)
    if (!order) continue
    const lockAt = lockAtFor(job, order)
    if (lockAt !== null && lockAt <= t) {
      await settleStatus(job, order)
      locked++
    }
  }
  return locked
}

export { parse as parseJson }
export type { Offer }
