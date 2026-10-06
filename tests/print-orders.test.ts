import { describe, expect, it, vi } from 'vitest'
import { catalogProduct } from '../lib/print/spec'
import {
  customerCan,
  effectiveStatus,
  fitFor,
  lockAtFor,
  mergeJobPages,
  pageFor,
  signWebhook,
  specForProduct,
  timeLeft,
  validateOrder,
  verifyWebhook,
} from '../lib/print/orders/rules'

// The MCP layer is tested for its protocol, not the database behind it.
vi.mock('../lib/print/orders/ops', () => ({
  productsOp: () => ({ products: [{ key: 'door-hanger' }] }),
  getJobOp: async (_who: unknown, id: string) => ({ id, status: 'received' }),
}))
vi.mock('../lib/print/orders/server', () => ({ OrderError: class extends Error {} }))

const NOW = 1_800_000_000
const opts = { now: NOW, approvalHours: 24 }

describe('incoming orders', () => {
  it('names every problem by its path', () => {
    const { order, errors } = validateOrder({ customer: { email: 'nope' }, jobs: [{ product: { width: 4 }, artwork: [{ url: 'ftp://x' }] }, 'job'] }, opts)
    expect(order).toBeUndefined()
    expect(errors.map((e) => e.path)).toEqual(['customer.email', 'jobs[0].product', 'jobs[0].artwork[0].url', 'jobs[1]'])
  })

  it('refuses an order with no jobs, and a body that isn’t an object', () => {
    expect(validateOrder({ jobs: [] }, opts).errors[0].path).toBe('jobs')
    expect(validateOrder([], opts).errors[0].message).toMatch(/JSON object/)
  })

  it('defaults the deadline to the account window, and accepts ISO, seconds or hours', () => {
    const job = { product: { key: 'flyer-letter' } }
    expect(validateOrder({ jobs: [job] }, opts).order!.lockAt).toBe(NOW + 24 * 3600)
    expect(validateOrder({ jobs: [job], approvalHours: 2 }, opts).order!.lockAt).toBe(NOW + 7200)
    expect(validateOrder({ jobs: [job], lockAt: '2027-01-01T00:00:00Z' }, opts).order!.lockAt).toBe(Date.parse('2027-01-01T00:00:00Z') / 1000)
    expect(validateOrder({ jobs: [job], lockAt: 'soon' }, opts).errors[0].path).toBe('lockAt')
  })

  it('names a job after its product when it has no name, and keeps the sender’s extra fields', () => {
    const { order } = validateOrder({ jobs: [{ product: { key: 'door-hanger', sku: 'DH-1', stock: '14pt' }, artwork: ['https://x.example/a.pdf'] }] }, opts)
    expect(order!.jobs[0].name).toBe('Door hanger')
    expect(order!.jobs[0].product.sku).toBe('DH-1')
    expect(order!.jobs[0].artwork[0].url).toBe('https://x.example/a.pdf')
    expect(order!.notifyCustomer).toBe(true)
  })
})

describe('products', () => {
  it('builds a catalog product with its shape and page count', () => {
    const built = specForProduct({ key: 'door-hanger', shape: 'rounded' })
    expect('spec' in built && built.spec.guide).toMatchObject({ kind: 'doorhanger', cornerIn: 0.5 })
    const one = specForProduct({ key: 'door-hanger', pages: 1 })
    expect('spec' in one && one.spec.pages).toHaveLength(1)
  })

  it('builds any size, in inches or millimetres', () => {
    const mm = specForProduct({ width: 210, height: 297, unit: 'mm', bleed: 3, safe: 5, pages: ['Front', 'Back'] })
    expect('spec' in mm && mm.spec.widthIn).toBeCloseTo(8.268, 2)
    expect('spec' in mm && mm.spec.bleedIn).toBeCloseTo(3 / 25.4, 4)
    expect('spec' in mm && mm.spec.pages.map((p) => p.label)).toEqual(['Front', 'Back'])
  })

  it('says what to do about an unknown key', () => {
    const bad = specForProduct({ key: 'mystery' })
    expect('error' in bad && bad.error).toMatch(/Unknown product key "mystery"/)
  })

  it('places files by index, label, or the next free page', () => {
    const labels = ['Front', 'Back']
    expect(pageFor('back', labels, new Set())).toBe(1)
    expect(pageFor(1, labels, new Set())).toBe(1)
    expect(pageFor(undefined, labels, new Set([0]))).toBe(1)
  })
})

describe('the deadline and who can act', () => {
  it('locks an open job once its deadline passes, and nothing after it', () => {
    expect(effectiveStatus('awaiting_approval', NOW - 1, NOW)).toBe('locked')
    expect(effectiveStatus('approved', NOW + 60, NOW)).toBe('approved')
    expect(effectiveStatus('in_production', NOW - 1, NOW)).toBe('in_production')
    expect(effectiveStatus('received', null, NOW)).toBe('received')
  })

  it('uses the job’s own deadline over the order’s', () => {
    expect(lockAtFor({ lockAt: 5 }, { lockAt: 9 })).toBe(5)
    expect(lockAtFor({ lockAt: null }, { lockAt: 9 })).toBe(9)
  })

  it('lets the customer approve only a proof, and nothing once locked', () => {
    expect(customerCan('received', false)).toEqual({ approve: false, requestChanges: true, upload: true })
    expect(customerCan('awaiting_approval', true).approve).toBe(true)
    expect(customerCan('locked', true)).toEqual({ approve: false, requestChanges: false, upload: false })
  })

  it('says how long is left in plain words', () => {
    expect(timeLeft(NOW + 600, NOW)).toBe('in 10 minutes')
    expect(timeLeft(NOW + 5 * 3600, NOW)).toBe('in 5 hours')
    expect(timeLeft(NOW + 3 * 86400, NOW)).toBe('in 3 days')
    expect(timeLeft(NOW - 1, NOW)).toBe('closed')
  })
})

describe('artwork fit', () => {
  const sign = specForProduct({ width: 24, height: 12, bleed: 0.5, safe: 0.5 })
  const spec = 'spec' in sign ? sign.spec : null!

  it('tells full bleed from trim size from the wrong shape', () => {
    expect(fitFor(25 / 13, spec).kind).toBe('bleed')
    expect(fitFor(2, spec).kind).toBe('trim')
    const wrong = fitFor(1, spec)
    expect(wrong.kind).toBe('mismatch')
    expect(wrong.loss).toBeCloseTo(1 - 13 / 25, 3)
    expect(fitFor(catalogProduct('door-hanger')!.spec.widthIn / 11, catalogProduct('door-hanger')!.spec).kind).toBe('trim')
  })
})

describe('saving a job’s artwork from the studio', () => {
  const v = (id: string, at: number) => ({ id, at, url: 'u', rawUrl: 'u', width: 1, height: 1, rawWidth: 1, rawHeight: 1, model: '', mode: 'create' as const })
  const mark = (id: string, by?: string) => ({ id, n: 1, kind: 'rect' as const, pts: [[[0, 0], [1, 1]]] as [number, number][][], note: '', status: 'open' as const, at: 0, by })

  it('keeps what the customer and the job page added while the studio was open', () => {
    const stored = [{ id: 'p', label: 'Front', current: 2, versions: [v('a', 1), v('b', 2), v('upload2', 5)], marks: [mark('m1', 'customer:Pat'), mark('m2')] }]
    const incoming = [{ id: 'p', label: 'Front', current: 2, versions: [v('a', 1), v('b', 2), v('studio', 3)], marks: [] }]
    const [page] = mergeJobPages(incoming, stored)
    expect(page.versions.map((x) => x.id)).toEqual(['a', 'b', 'studio', 'upload2'])
    expect(page.versions[page.current].id).toBe('upload2')
    expect(page.marks!.map((m) => m.id)).toEqual(['m1'])
  })

  it('doesn’t move the studio off its version for something older', () => {
    const stored = [{ id: 'p', label: 'Front', current: 0, versions: [v('a', 1), v('fix', 4)] }]
    const incoming = [{ id: 'p', label: 'Front', current: 1, versions: [v('a', 1), v('studio', 9)] }]
    const [page] = mergeJobPages(incoming, stored)
    expect(page.versions[page.current].id).toBe('studio')
    expect(page.versions.map((x) => x.id)).toEqual(['a', 'fix', 'studio'])
  })
})

describe('webhooks', () => {
  it('signs the timestamp with the body, and rejects tampering and replays', () => {
    const body = JSON.stringify({ type: 'job.approved' })
    const header = signWebhook('whsec_test', body, NOW)
    expect(verifyWebhook('whsec_test', body, header, NOW + 10)).toBe(true)
    expect(verifyWebhook('whsec_test', body.replace('approved', 'locked'), header, NOW)).toBe(false)
    expect(verifyWebhook('whsec_other', body, header, NOW)).toBe(false)
    expect(verifyWebhook('whsec_test', body, header, NOW + 3600)).toBe(false)
  })
})

describe('MCP', () => {
  it('initializes, lists tools and calls one', async () => {
    const { handleRpc, TOOLS } = await import('../lib/print/orders/mcp')
    const who = { userId: 'u', actor: 'api' as const }
    const init = (await handleRpc(who, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })) as { result: { serverInfo: { name: string }; capabilities: unknown } }
    expect(init.result.serverInfo.name).toBe('kanthink-print')
    expect(await handleRpc(who, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    const list = (await handleRpc(who, { jsonrpc: '2.0', id: 2, method: 'tools/list' })) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name))
    expect(list.result.tools.map((t) => t.name)).toContain('create_order')
    const call = (await handleRpc(who, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_job', arguments: { id: 'j1' } } })) as { result: { structuredContent: { id: string } } }
    expect(call.result.structuredContent.id).toBe('j1')
    const missing = (await handleRpc(who, { jsonrpc: '2.0', id: 4, method: 'nope' })) as { error: { code: number } }
    expect(missing.error.code).toBe(-32601)
  })
})
