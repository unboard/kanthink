import { effectiveDpi } from '../spec'
import type { PreflightResult, PrintDesign, PrintSpec, PrintVersion } from '../types'
import type { Mark } from '../markup'
import { customerCan, lockAtFor, timeLeft } from './rules'
import { baseUrl, designOf, eventsOf, getPartner, jobsOf, parseJson, settleStatus, type JobRow, type OrderRow } from './server'
import type { ArtworkFile, Customer, JobEvent, JobProof, JobStatus, Offer, PartnerBrand } from './types'

/**
 * What leaves the server: the API's job and order, and the shared page's view.
 *
 * The page view is built per audience. The customer sees the proof, what they sent,
 * the checks, the timeline and their own marks — never the printer's working versions
 * or other customers' orders. The printer sees all of it plus what's in progress.
 */

const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null)

export interface VersionLite {
  id: string
  url: string
  width: number
  height: number
  mode: string
  at: number
  check?: { ok: boolean; dpi: number; issues: { kind: string; severity: string; message: string; box?: number[] }[] }
}

function lite(v: PrintVersion | undefined | null): VersionLite | null {
  if (!v) return null
  return {
    id: v.id,
    url: v.url,
    width: v.width,
    height: v.height,
    mode: v.mode,
    at: v.at,
    check: v.check ? { ok: v.check.ok, dpi: v.check.dpi, issues: v.check.issues.map((i) => ({ kind: i.kind, severity: i.severity, message: i.message, box: i.box })) } : undefined,
  }
}

/** The version a page proofs, else (before any proof) its latest. */
function proofVersion(design: PrintDesign, proof: JobProof | null, i: number): PrintVersion | null {
  const page = design.pages[i]
  if (!page) return null
  if (proof) return page.versions.find((v) => v.id === proof.versions[i]) ?? null
  return null
}

/**
 * The finished print file for each page: the approved or locked proof, else the
 * current version. This is what "final" means everywhere outside the page.
 */
export function finalVersions(design: PrintDesign, job: JobRow): (PrintVersion | null)[] {
  const proof = parseJson<JobProof | null>(job.proof, null)
  return design.pages.map((p, i) => proofVersion(design, proof, i) ?? p.versions[p.current] ?? null)
}

// ---------------------------------------------------------------------------
// "What we checked"
// ---------------------------------------------------------------------------

export interface CheckLine {
  label: string
  ok: boolean | null
  note?: string
}

/**
 * The checks a customer sees, in plain words. Built from the print check of each page
 * and how the artwork fit, so "we checked it" always means something specific.
 */
export function checkLines(spec: PrintSpec, versions: (PrintVersion | null)[], artwork: ArtworkFile[], fitNotes: { page: number; kind: string; message: string }[]): CheckLine[] {
  const checks = versions.map((v) => v?.check).filter((c): c is PreflightResult => !!c)
  if (!checks.length) return []
  const has = (...kinds: string[]) => checks.some((c) => c.issues.some((i) => kinds.includes(i.kind) && i.severity === 'error'))
  const dpi = Math.min(...versions.filter((v): v is PrintVersion => !!v).map((v) => effectiveDpi(spec, v.width)))
  // A misfit only counts while the page still shows the file as it arrived; a rebuilt page fits.
  const mismatch = fitNotes.find((f) => f.kind === 'mismatch' && versions[f.page]?.mode === 'upload')
  return [
    { label: `Fits the ${spec.name.toLowerCase()}`, ok: !mismatch, note: mismatch?.message },
    { label: 'Words and logos inside the safe area', ok: !has('safe', 'cut', 'fold') },
    { label: 'Color runs to the edge (bleed)', ok: !has('border') },
    { label: 'Sharp enough to print', ok: dpi >= 150, note: `${dpi} dpi at print size` },
    { label: 'Spelling and phone numbers', ok: !has('spelling') },
    ...(artwork.some((a) => a.origin?.aiGenerated) ? [{ label: 'AI-made artwork reviewed by a person', ok: null }] : []),
  ]
}

// ---------------------------------------------------------------------------
// The API's shapes
// ---------------------------------------------------------------------------

export async function apiJob(job: JobRow, order: OrderRow) {
  const status = await settleStatus(job, order)
  const design = await designOf(job)
  const proof = parseJson<JobProof | null>(job.proof, null)
  const finals = finalVersions(design, job)
  const base = baseUrl()
  return {
    id: job.id,
    externalId: job.externalId,
    orderId: job.orderId,
    name: job.name,
    quantity: job.quantity,
    status,
    lockAt: iso(lockAtFor(job, order)),
    approvedAt: iso(job.approvedAt),
    approvedBy: job.approvedBy,
    product: parseJson<Record<string, unknown>>(job.product, {}),
    spec: design.spec,
    links: {
      customer: `${base}/proof/${job.token}`,
      printer: `${base}/print/jobs/${job.id}`,
      printFile: `${base}/api/v1/print/jobs/${job.id}/print-file`,
    },
    pages: design.pages.map((p, i) => ({
      label: p.label,
      final: lite(finals[i]),
      proof: lite(proofVersion(design, proof, i)),
      current: lite(p.versions[p.current]),
      original: lite(p.versions.find((v) => v.mode === 'upload')),
      openMarks: (p.marks ?? []).filter((m) => m.status === 'open').map((m) => ({ n: m.n, kind: m.kind, note: m.note, by: m.by })),
    })),
    artwork: parseJson<ArtworkFile[]>(job.artwork, []),
    proof: proof ? { message: proof.message ?? null, changes: proof.changes, sentAt: iso(proof.sentAt) } : null,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
  }
}

export async function apiOrder(order: OrderRow, withJobs = true) {
  const jobs = withJobs ? await jobsOf(order.id) : []
  return {
    id: order.id,
    externalId: order.externalId,
    ref: order.ref,
    source: order.source,
    customer: parseJson<Customer>(order.customer, {}),
    lockAt: iso(order.lockAt),
    metadata: parseJson<Record<string, unknown> | null>(order.metadata, null),
    offer: parseJson<Offer | null>(order.offer, null),
    links: { customer: `${baseUrl()}/proof/o/${order.token}`, printer: `${baseUrl()}/print/orders/${order.id}` },
    jobs: withJobs ? await Promise.all(jobs.map((j) => apiJob(j, order))) : undefined,
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// The shared page
// ---------------------------------------------------------------------------

export type Audience = 'customer' | 'printer'

export interface PageView {
  audience: Audience
  brand: PartnerBrand
  order: { id?: string; ref: string | null; customerName?: string; customer?: Customer; offer: Offer | null; token: string }
  job: {
    id?: string
    token: string
    name: string
    quantity: number | null
    status: JobStatus
    lockAt: number | null
    timeLeft: string | null
    approvedAt: number | null
    product: Record<string, unknown>
    designId?: string
  }
  siblings: { name: string; token: string; id?: string; status: JobStatus; thumb: string | null; current: boolean }[]
  spec: PrintSpec
  pages: {
    label: string
    proof: VersionLite | null
    original: VersionLite | null
    current?: VersionLite | null
    versions?: number
    marks: Mark[]
  }[]
  proof: { message: string | null; changes: JobProof['changes']; sentAt: number } | null
  checks: CheckLine[]
  fit: { page: number; kind: string; message: string }[]
  artwork: ArtworkFile[]
  events: JobEvent[]
  can: { approve: boolean; requestChanges: boolean; upload: boolean }
  now: number
}

export async function pageView(job: JobRow, order: OrderRow, audience: Audience): Promise<PageView> {
  const status = await settleStatus(job, order)
  const [design, partner, events, jobs] = await Promise.all([designOf(job), getPartner(job.userId), eventsOf(job.id), jobsOf(order.id)])
  const proof = parseJson<JobProof | null>(job.proof, null)
  const customer = parseJson<Customer>(order.customer, {})
  const artwork = parseJson<ArtworkFile[]>(job.artwork, [])
  const lockAt = lockAtFor(job, order)
  const t = Math.floor(Date.now() / 1000)
  // How each file fit, from when it arrived; a newer file for a page replaces the note.
  const fitByPage = new Map<number, { page: number; kind: string; message: string }>()
  for (const e of events.filter((x) => x.type === 'created' || x.type === 'artwork_added')) {
    for (const f of (e.data?.fit as { page: number; kind: string; message: string }[] | undefined) ?? []) fitByPage.set(f.page, f)
  }
  const fit = [...fitByPage.values()].filter((f) => f.kind !== 'bleed')

  const shown = design.pages.map((p, i) => proofVersion(design, proof, i) ?? (audience === 'printer' ? p.versions[p.current] : p.versions.find((v) => v.mode === 'upload')) ?? null)
  const siblingThumbs = await Promise.all(
    jobs.map(async (j) => {
      if (j.id === job.id) return shown[0]?.url ?? null
      const d = await designOf(j).catch(() => null)
      if (!d) return null
      const pr = parseJson<JobProof | null>(j.proof, null)
      const v = (pr && d.pages[0]?.versions.find((x) => x.id === pr.versions[0])) ?? d.pages[0]?.versions.find((x) => x.mode === 'upload') ?? d.pages[0]?.versions[d.pages[0].current]
      return v?.url ?? null
    }),
  )

  return {
    audience,
    brand: partner.brand,
    order: {
      id: audience === 'printer' ? order.id : undefined,
      ref: order.ref,
      customerName: customer.name,
      customer: audience === 'printer' ? customer : undefined,
      offer: parseJson<Offer | null>(order.offer, null),
      token: order.token,
    },
    job: {
      id: audience === 'printer' ? job.id : undefined,
      token: job.token,
      name: job.name,
      quantity: job.quantity,
      status,
      lockAt,
      timeLeft: timeLeft(lockAt, t),
      approvedAt: job.approvedAt,
      product: parseJson<Record<string, unknown>>(job.product, {}),
      designId: audience === 'printer' ? design.id : undefined,
    },
    siblings: jobs.map((j, i) => ({
      name: j.name,
      token: j.token,
      id: audience === 'printer' ? j.id : undefined,
      status: j.status as JobStatus,
      thumb: siblingThumbs[i],
      current: j.id === job.id,
    })),
    spec: design.spec,
    pages: design.pages.map((p, i) => ({
      label: p.label,
      proof: lite(proofVersion(design, proof, i)),
      original: lite(p.versions.find((v) => v.mode === 'upload')),
      current: audience === 'printer' ? lite(p.versions[p.current]) : undefined,
      versions: audience === 'printer' ? p.versions.length : undefined,
      marks: (p.marks ?? []).filter((m) => audience === 'printer' || m.by?.startsWith('customer')),
    })),
    proof: proof ? { message: proof.message ?? null, changes: proof.changes, sentAt: proof.sentAt } : null,
    checks: checkLines(design.spec, shown, artwork, fit),
    fit,
    artwork: audience === 'printer' ? artwork : artwork.map((a) => ({ ...a, sourceUrl: undefined })),
    // Working steps stay on the printer's side; the customer sees them once a proof is sent.
    events: events.filter((e) => audience === 'printer' || !['deadline_changed', 'checked', 'revised'].includes(e.type)),
    can: audience === 'customer' ? customerCan(status, !!proof) : { approve: ['received', 'awaiting_approval', 'changes_requested'].includes(status), requestChanges: false, upload: !['in_production', 'complete', 'canceled'].includes(status) },
    now: t,
  }
}
