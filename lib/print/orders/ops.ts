import { CATALOG } from '../spec'
import type { Caller } from './api'
import { effectiveStatus, lockAtFor, parseTime, validateOrder, type ArtworkInput } from './rules'
import {
  OrderError,
  addArtwork,
  addComment,
  designOf,
  approveJob,
  createOrder,
  eventsOf,
  findJob,
  findOrder,
  getPartner,
  jobsOf,
  listOrders,
  orderOf,
  sendProof,
  setDeadline,
  setJobStatus,
} from './server'
import { JOB_STATUSES, type JobStatus, type ProofChange } from './types'
import { apiJob, apiOrder } from './views'

/**
 * Everything the API can do, once. The REST routes and the MCP tools both call these,
 * so a bot and a developer get the same behaviour and the same errors.
 */

const PRINTER_STATUSES: JobStatus[] = ['locked', 'in_production', 'complete', 'cancelled', 'received']

async function job(who: Caller, id: string) {
  const j = await findJob(who.userId, id)
  if (!j) throw new OrderError(`No job "${id}" on this account.`, 404)
  return j
}

export async function createOrderOp(who: Caller, input: unknown, source: 'api' | 'mcp' | 'studio') {
  const partner = await getPartner(who.userId)
  const { order, errors } = validateOrder(input, { now: Math.floor(Date.now() / 1000), approvalHours: partner.approvalHours })
  if (!order) {
    throw new OrderError(`The order isn't valid: ${errors.map((x) => `${x.path || 'body'} — ${x.message}`).join('; ')}`, 422, errors[0]?.path, errors)
  }
  const made = await createOrder(who.userId, order, source)
  return { created: made.created, order: await apiOrder(made.order) }
}

export async function getOrderOp(who: Caller, id: string) {
  const order = await findOrder(who.userId, id)
  if (!order) throw new OrderError(`No order "${id}" on this account.`, 404)
  return apiOrder(order)
}

export async function listOrdersOp(who: Caller, opts: { limit?: number; since?: unknown }) {
  const rows = await listOrders(who.userId, { limit: opts.limit, since: parseTime(opts.since) })
  const t = Math.floor(Date.now() / 1000)
  return {
    orders: await Promise.all(
      rows.map(async (o) => ({
        ...(await apiOrder(o, false)),
        // A light summary per job; GET the order for everything.
        jobs: await Promise.all(
          (await jobsOf(o.id)).map(async (j) => {
            const d = await designOf(j).catch(() => null)
            const first = d?.pages[0]
            return {
              id: j.id,
              externalId: j.externalId,
              name: j.name,
              quantity: j.quantity,
              status: effectiveStatus(j.status as JobStatus, lockAtFor(j, o), t),
              thumb: first?.versions[first.current]?.url ?? null,
            }
          }),
        ),
      })),
    ),
  }
}

export async function getJobOp(who: Caller, id: string) {
  const j = await job(who, id)
  return apiJob(j, await orderOf(j))
}

export async function addArtworkOp(who: Caller, id: string, artwork: unknown) {
  const list = Array.isArray(artwork) ? artwork : artwork ? [artwork] : []
  const inputs: ArtworkInput[] = list
    .map((a) => (typeof a === 'string' ? { url: a } : (a as ArtworkInput)))
    .filter((a) => a && typeof a.url === 'string' && /^(https:\/\/|data:)/i.test(a.url))
  if (!inputs.length) throw new OrderError('Send artwork as [{ "url": "https://…", "page": "front" }].', 422, 'artwork')
  const updated = await addArtwork(await job(who, id), inputs, who.actor)
  return apiJob(updated, await orderOf(updated))
}

const CHANGE_KINDS: ProofChange['kind'][] = ['fit', 'resolution', 'spelling', 'safe', 'bleed', 'content', 'other']

export async function sendProofOp(who: Caller, id: string, args: { message?: unknown; changes?: unknown; notify?: unknown }) {
  const changes: ProofChange[] = (Array.isArray(args.changes) ? args.changes : [])
    .map((c) => (typeof c === 'string' ? { kind: 'other' as const, text: c } : (c as ProofChange)))
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .map((c) => ({ kind: CHANGE_KINDS.includes(c.kind) ? c.kind : 'other', text: c.text.trim().slice(0, 300) }))
  const updated = await sendProof(await job(who, id), { message: typeof args.message === 'string' ? args.message : undefined, changes, notify: args.notify !== false }, who.actor)
  return apiJob(updated, await orderOf(updated))
}

export async function approveOp(who: Caller, id: string, by?: unknown) {
  const updated = await approveJob(await job(who, id), who.actor, typeof by === 'string' ? by : undefined)
  return apiJob(updated, await orderOf(updated))
}

export async function messageOp(who: Caller, id: string, message: unknown) {
  const j = await job(who, id)
  await addComment(j, typeof message === 'string' ? message : '', who.actor)
  return { ok: true }
}

export async function setStatusOp(who: Caller, id: string, status: unknown) {
  if (!PRINTER_STATUSES.includes(status as JobStatus)) {
    throw new OrderError(`status must be one of ${PRINTER_STATUSES.join(', ')}. Approval comes from the customer (or approve).`, 422, 'status')
  }
  const updated = await setJobStatus(await job(who, id), status as JobStatus, who.actor)
  return apiJob(updated, await orderOf(updated))
}

export async function setDeadlineOp(who: Caller, target: { orderId?: string; jobId?: string }, lockAt: unknown) {
  const t = lockAt === null ? null : parseTime(lockAt)
  if (t === undefined) throw new OrderError('lockAt must be an ISO 8601 date, epoch seconds, or null.', 422, 'lockAt')
  if (target.jobId) {
    const j = await job(who, target.jobId)
    await setDeadline({ job: j }, t, who.actor)
    return apiJob({ ...j, lockAt: t }, await orderOf(j))
  }
  const order = await findOrder(who.userId, target.orderId ?? '')
  if (!order) throw new OrderError('No such order.', 404)
  await setDeadline({ order }, t, who.actor)
  return apiOrder({ ...order, lockAt: t })
}

export async function eventsOp(who: Caller, id: string) {
  const j = await job(who, id)
  return { events: (await eventsOf(j.id)).map((e) => ({ ...e, type: `job.${e.type}`, at: new Date(e.at * 1000).toISOString() })) }
}

export function productsOp() {
  return {
    products: CATALOG.map((p) => ({
      key: p.key,
      name: p.name,
      group: p.group,
      size: { width: p.spec.widthIn, height: p.spec.heightIn, unit: 'in', bleed: p.spec.bleedIn, safe: p.spec.safeIn },
      pages: p.spec.pages.map((x) => x.label),
      pageOptions: p.pageOptions,
      shapes: p.shapes?.map((s) => s.key),
      folds: p.spec.folds,
      dieCut: p.spec.guide?.kind ?? null,
    })),
  }
}

export { JOB_STATUSES }
