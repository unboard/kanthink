/**
 * The rules of an order, as pure functions: when a job locks, what each side may do,
 * what an incoming order must look like, and how webhooks are signed.
 *
 * Everything that touches the database lives in server.ts; this file is tested alone.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { catalogProduct, sheetRatio, specWithPageCount, specWithShape, validateSpec } from '../spec'
import type { GuideShape, PrintPage, PrintSpec } from '../types'
import { OPEN_STATUSES, type ArtworkOrigin, type Customer, type JobStatus, type Offer } from './types'

// ---------------------------------------------------------------------------
// Deadline and status
// ---------------------------------------------------------------------------

/** A job's deadline: its own, else its order's. Epoch seconds, or null for none. */
export function lockAtFor(job: { lockAt?: number | null }, order: { lockAt?: number | null }): number | null {
  return job.lockAt ?? order.lockAt ?? null
}

/**
 * The status as it stands now. The deadline closes a job without anything having to
 * run at that moment: an open job past its deadline simply reads as locked.
 */
export function effectiveStatus(status: JobStatus, lockAt: number | null, now: number): JobStatus {
  if (lockAt !== null && now >= lockAt && OPEN_STATUSES.includes(status)) return 'locked'
  return status
}

export function isOpen(status: JobStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

/** What the customer can do on the page right now. */
export function customerCan(status: JobStatus, hasProof: boolean) {
  const open = isOpen(status)
  return {
    approve: open && hasProof && status !== 'approved',
    requestChanges: open,
    upload: open,
  }
}

/** "in 2 days", "in 5 hours", "in 12 minutes", "closed". For the page and emails. */
export function timeLeft(lockAt: number | null, now: number): string | null {
  if (lockAt === null) return null
  const s = lockAt - now
  if (s <= 0) return 'closed'
  const m = Math.round(s / 60)
  if (m < 60) return `in ${m} minute${m === 1 ? '' : 's'}`
  const h = Math.round(s / 3600)
  if (h < 48) return `in ${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(s / 86400)
  return `in ${d} days`
}

// ---------------------------------------------------------------------------
// Incoming orders
// ---------------------------------------------------------------------------

export interface FieldError {
  path: string
  message: string
}

export interface ArtworkInput {
  /** An https link we fetch, or a data: URL. */
  url: string
  /** Page index from 0, or the page's label ("front", "back"). */
  page?: number | string
  filename?: string
  origin?: ArtworkOrigin
}

export interface ProductInput {
  /** A catalog product key, e.g. "door-hanger", "yard-sign" — or leave out and give a size. */
  key?: string
  /** A catalog product's die-line variant, e.g. "square" or "rounded". */
  shape?: string
  name?: string
  width?: number
  height?: number
  /** "in" (default) or "mm". Applies to width, height, bleed and safe. */
  unit?: 'in' | 'mm'
  bleed?: number
  safe?: number
  /** Page labels, e.g. ["Front", "Back"], or a count. */
  pages?: string[] | number
  /** Anything else the sender tracks (sku, stock, finish, coating…). Kept and returned as is. */
  [extra: string]: unknown
}

export interface JobInput {
  externalId?: string
  name: string
  quantity?: number
  product: ProductInput
  artwork: ArtworkInput[]
  notes?: string
  lockAt?: number
}

export interface OrderInput {
  externalId?: string
  ref?: string
  customer: Customer
  lockAt?: number
  metadata?: Record<string, unknown>
  offer?: Offer
  notifyCustomer: boolean
  jobs: JobInput[]
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** An ISO date, epoch seconds or epoch milliseconds, as epoch seconds. */
export function parseTime(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v > 1e12 ? v / 1000 : v)
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return Math.round(t / 1000)
  }
  return undefined
}

function cleanOrigin(v: unknown): ArtworkOrigin | undefined {
  if (!isObj(v)) return undefined
  const madeBy = ['customer', 'designer', 'printer', 'unknown'].includes(v.madeBy as string) ? (v.madeBy as ArtworkOrigin['madeBy']) : undefined
  const via = ['upload', 'editor', 'reorder', 'email', 'api'].includes(v.via as string) ? (v.via as ArtworkOrigin['via']) : undefined
  const out: ArtworkOrigin = {
    madeBy,
    madeWith: str(v.madeWith, 80),
    via,
    aiGenerated: typeof v.aiGenerated === 'boolean' ? v.aiGenerated : undefined,
    reorderOf: str(v.reorderOf, 120),
  }
  return Object.values(out).some((x) => x !== undefined) ? out : undefined
}

/**
 * Check an order from outside and say exactly what is wrong with it. Errors name the
 * field ("jobs[1].product.width") so a developer can fix the payload without guessing.
 */
export function validateOrder(input: unknown, opts: { now: number; approvalHours: number }): { order?: OrderInput; errors: FieldError[] } {
  const errors: FieldError[] = []
  if (!isObj(input)) return { errors: [{ path: '', message: 'The body must be a JSON object.' }] }

  const c = isObj(input.customer) ? input.customer : {}
  const customer: Customer = {
    name: str(c.name, 120),
    email: str(c.email, 200),
    phone: str(c.phone, 40),
    company: str(c.company, 120),
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.push({ path: 'customer.email', message: 'Not an email address.' })

  let lockAt = parseTime(input.lockAt)
  if (input.lockAt !== undefined && lockAt === undefined) errors.push({ path: 'lockAt', message: 'Give an ISO 8601 date, or epoch seconds.' })
  const hours = typeof input.approvalHours === 'number' && input.approvalHours > 0 ? input.approvalHours : undefined
  if (lockAt === undefined) lockAt = opts.now + Math.round((hours ?? opts.approvalHours) * 3600)

  let offer: Offer | undefined
  if (isObj(input.offer)) {
    const title = str(input.offer.title, 120)
    if (!title) errors.push({ path: 'offer.title', message: 'An offer needs a title.' })
    else offer = { title, body: str(input.offer.body, 600), url: str(input.offer.url, 500), cta: str(input.offer.cta, 40) }
  }

  const jobsIn = Array.isArray(input.jobs) ? input.jobs : []
  if (!jobsIn.length) errors.push({ path: 'jobs', message: 'An order needs at least one job.' })
  if (jobsIn.length > 50) errors.push({ path: 'jobs', message: 'At most 50 jobs per order.' })

  const jobs: JobInput[] = []
  jobsIn.slice(0, 50).forEach((j, i) => {
    const at = `jobs[${i}]`
    if (!isObj(j)) {
      errors.push({ path: at, message: 'Each job must be an object.' })
      return
    }
    const product = isObj(j.product) ? (j.product as ProductInput) : null
    if (!product) errors.push({ path: `${at}.product`, message: 'Each job needs a product: a catalog key, or a width and height.' })
    else {
      const built = specForProduct(product)
      if ('error' in built) errors.push({ path: `${at}.product`, message: built.error })
    }
    const art = Array.isArray(j.artwork) ? j.artwork : j.artwork === undefined ? [] : null
    if (art === null) errors.push({ path: `${at}.artwork`, message: 'artwork must be a list of files.' })
    const artwork: ArtworkInput[] = []
    ;(art ?? []).slice(0, 12).forEach((a, k) => {
      const url = isObj(a) ? str(a.url, 4_000_000) : typeof a === 'string' ? a : undefined
      if (!url || !/^(https:\/\/|data:)/i.test(url)) {
        errors.push({ path: `${at}.artwork[${k}].url`, message: 'Give an https link or a data: URL.' })
        return
      }
      const page = isObj(a) ? (typeof a.page === 'number' || typeof a.page === 'string' ? a.page : undefined) : undefined
      artwork.push({ url, page, filename: isObj(a) ? str(a.filename, 200) : undefined, origin: isObj(a) ? cleanOrigin(a.origin) : undefined })
    })
    const jobLock = parseTime(j.lockAt)
    jobs.push({
      externalId: str(j.externalId, 120),
      name: str(j.name, 120) ?? (product ? str(product.name, 120) ?? (product.key ? catalogProduct(product.key)?.name : undefined) ?? `Job ${i + 1}` : `Job ${i + 1}`),
      quantity: typeof j.quantity === 'number' && j.quantity > 0 ? Math.round(j.quantity) : undefined,
      product: product ?? {},
      artwork,
      notes: str(j.notes, 2000),
      lockAt: jobLock,
    })
  })

  if (errors.length) return { errors }
  return {
    errors,
    order: {
      externalId: str(input.externalId, 120),
      ref: str(input.ref, 60),
      customer,
      lockAt,
      metadata: isObj(input.metadata) ? input.metadata : undefined,
      offer,
      notifyCustomer: input.notifyCustomer !== false,
      jobs,
    },
  }
}

const MM = 25.4

/**
 * The print spec for a product as a sender describes it: a catalog key (with an
 * optional shape and page count), or a size with bleed and safe margins.
 */
export function specForProduct(p: ProductInput): { spec: PrintSpec } | { error: string } {
  const pageLabels = Array.isArray(p.pages)
    ? p.pages.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 12).map((x) => x.trim().slice(0, 40))
    : null
  const pageCount = typeof p.pages === 'number' ? Math.round(p.pages) : pageLabels?.length ?? null

  if (p.key) {
    const product = catalogProduct(String(p.key))
    if (!product) return { error: `Unknown product key "${p.key}". Leave key out and give width and height instead, or use one of the catalog keys in the docs.` }
    let spec = specWithShape(product.spec, product, typeof p.shape === 'string' ? p.shape : null)
    if (pageCount && pageCount !== spec.pages.length) spec = specWithPageCount(spec, pageCount)
    if (pageLabels?.length) spec = { ...spec, pages: spec.pages.map((pg, i) => ({ ...pg, label: pageLabels[i] ?? pg.label })) }
    if (typeof p.name === 'string' && p.name.trim()) spec = { ...spec, name: p.name.trim().slice(0, 80) }
    return { spec }
  }

  const unit = p.unit === 'mm' ? 'mm' : 'in'
  const toIn = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? (unit === 'mm' ? v / MM : v) : undefined)
  const widthIn = toIn(p.width)
  const heightIn = toIn(p.height)
  if (!widthIn || !heightIn) return { error: 'Give width and height (in inches, or set unit: "mm"), or a catalog key.' }
  const labels = pageLabels?.length ? pageLabels : Array.from({ length: Math.max(1, Math.min(12, pageCount ?? 1)) }, (_, i) => (i === 0 ? 'Front' : i === 1 ? 'Back' : `Page ${i + 1}`))
  const raw: PrintSpec = {
    id: 'custom',
    name: (typeof p.name === 'string' && p.name.trim().slice(0, 80)) || 'Custom size',
    widthIn,
    heightIn,
    bleedIn: toIn(p.bleed) ?? 0.125,
    safeIn: toIn(p.safe) ?? 0.125,
    pages: labels.map((label) => ({ label })),
    unit,
    guide: guideFrom(p.guide),
  }
  const spec = validateSpec(raw)
  if (!spec) return { error: 'That size isn’t one we can print: check width, height, bleed and safe (bleed and safe must be small next to the size).' }
  return { spec }
}

function guideFrom(v: unknown): GuideShape | undefined {
  if (!isObj(v)) return undefined
  if (v.kind === 'circle') return { kind: 'circle' }
  if (v.kind === 'rounded' && typeof v.radiusIn === 'number') return { kind: 'rounded', radiusIn: v.radiusIn }
  return undefined
}

/** Which page an artwork file is for: an index, a label like "back", or the next free one. */
export function pageFor(page: number | string | undefined, labels: string[], taken: Set<number>): number {
  if (typeof page === 'number' && page >= 0 && page < labels.length) return Math.floor(page)
  if (typeof page === 'string') {
    const i = labels.findIndex((l) => l.toLowerCase() === page.trim().toLowerCase())
    if (i >= 0) return i
    const n = Number(page)
    if (Number.isInteger(n) && n >= 0 && n < labels.length) return n
  }
  for (let i = 0; i < labels.length; i++) if (!taken.has(i)) return i
  return 0
}

// ---------------------------------------------------------------------------
// Artwork fit
// ---------------------------------------------------------------------------

export interface ArtworkFit {
  kind: 'bleed' | 'trim' | 'mismatch'
  /** Share of the artwork's area cut off to fit, 0..1. */
  loss: number
  message: string
}

const near = (a: number, b: number, tol = 0.012) => Math.abs(Math.log(a / b)) < tol

/** How a file of this shape fits the sheet. Pure, so it is tested. */
export function fitFor(artRatio: number, spec: PrintSpec): ArtworkFit {
  const sheet = sheetRatio(spec)
  const trim = spec.widthIn / spec.heightIn
  if (near(artRatio, sheet)) return { kind: 'bleed', loss: 0, message: 'The file includes bleed and matches this product.' }
  if (near(artRatio, trim)) {
    return {
      kind: 'trim',
      loss: 0,
      message: 'The file is the finished size with no bleed, so its edges were extended to fill the bleed. Check that nothing at the edges looks stretched.',
    }
  }
  const loss = 1 - Math.min(artRatio / sheet, sheet / artRatio)
  const pct = Math.round(loss * 100)
  const shape = (r: number) => (r > 1.02 ? 'wider' : r < 0.98 ? 'taller' : 'square')
  return {
    kind: 'mismatch',
    loss,
    message: `The file is a different shape from this product (${shape(artRatio / sheet) === 'wider' ? 'wider' : 'taller'} than it), so about ${pct}% of it is cut off to fit. Rebuild it to fit, or check nothing important is lost.`,
  }
}

// ---------------------------------------------------------------------------
// Saving a job's artwork from the studio
// ---------------------------------------------------------------------------

/**
 * A job's design has writers besides the open studio: the customer adds files and
 * marks, the job page runs fixes. The studio saves its whole copy, so nothing stored is
 * dropped by it: versions it doesn't have are kept (and the newest becomes current if
 * it's newer than anything the studio has), and so are customer marks. The cost is that
 * deleting a version in the studio doesn't stick on a job's artwork — a fair trade for
 * never losing a customer's file.
 */
export function mergeJobPages(incoming: PrintPage[], stored: PrintPage[]): PrintPage[] {
  return incoming.map((page, i) => {
    const before = stored[i]
    if (!before) return page
    const have = new Set(page.versions.map((v) => v.id))
    const newest = Math.max(0, ...page.versions.map((v) => v.at ?? 0))
    const added = before.versions.filter((v) => !have.has(v.id))
    const markIds = new Set((page.marks ?? []).map((m) => m.id))
    const theirs = (before.marks ?? []).filter((m) => m.by?.startsWith('customer') && !markIds.has(m.id))
    if (!added.length && !theirs.length) return page
    const versions = [...page.versions, ...added].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    const latest = added.filter((v) => (v.at ?? 0) > newest).at(-1)
    const keep = page.versions[page.current]?.id
    const current = Math.max(0, versions.findIndex((v) => v.id === (latest?.id ?? keep)))
    return { ...page, versions, current, marks: [...(page.marks ?? []), ...theirs] }
  })
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * The signature on a webhook: HMAC-SHA256 of "<timestamp>.<body>" with the secret,
 * sent as `Kanthink-Signature: t=<timestamp>,v1=<hex>`. The timestamp is signed so an
 * old delivery can't be replayed as new.
 */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

/** The receiving side of signWebhook, for docs and for anyone checking in Node. */
export function verifyWebhook(secret: string, body: string, header: string, now: number, toleranceSeconds = 300): boolean {
  const t = Number(header.match(/t=(\d+)/)?.[1])
  const v1 = header.match(/v1=([a-f0-9]{64})/)?.[1]
  if (!t || !v1 || Math.abs(now - t) > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}
