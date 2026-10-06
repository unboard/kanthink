import type { Caller } from './api'
import {
  addArtworkOp,
  approveOp,
  createOrderOp,
  eventsOp,
  getJobOp,
  getOrderOp,
  listOrdersOp,
  messageOp,
  productsOp,
  sendProofOp,
  setDeadlineOp,
  setStatusOp,
} from './ops'
import { OrderError } from './server'

/**
 * The print API as MCP tools, over Streamable HTTP, stateless.
 *
 * A bot connects to /api/v1/print/mcp with the same API key a developer uses
 * (`Authorization: Bearer kp_live_…`) and gets these tools. Each one is a thin call
 * into ops.ts, so a bot can do exactly what the REST API does, with the same errors.
 */

const artworkSchema = {
  type: 'array',
  description: 'Artwork files. Each is { url, page?, filename?, origin? }. url is an https link (PDF, PNG, JPG, TIFF, WebP) or a data: URL. page is an index from 0 or a page label like "front"/"back"; a multi-page PDF fills pages in order.',
  items: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      page: { type: ['integer', 'string'] },
      filename: { type: 'string' },
      origin: {
        type: 'object',
        description: 'Where the artwork came from, if known.',
        properties: {
          madeBy: { type: 'string', enum: ['customer', 'designer', 'printer', 'unknown'] },
          madeWith: { type: 'string', description: 'e.g. Canva, Illustrator, our online editor' },
          via: { type: 'string', enum: ['upload', 'editor', 'reorder', 'email', 'api'] },
          aiGenerated: { type: 'boolean' },
          reorderOf: { type: 'string' },
        },
      },
    },
    required: ['url'],
  },
}

export const TOOLS = [
  {
    name: 'list_products',
    description: 'Catalog products an order can name by key, with sizes, bleed, safe area, pages and shapes. Any other size can be given as width/height instead.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_order',
    description:
      'Create a print order with one or more jobs. Each job gets a shared proof page the customer can open, approve or ask changes on before the deadline. Idempotent on externalId. Returns the order with each job\'s links.',
    inputSchema: {
      type: 'object',
      properties: {
        externalId: { type: 'string', description: 'Your id for the order. Sending it again returns the same order.' },
        ref: { type: 'string', description: 'Order number shown to people.' },
        customer: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, company: { type: 'string' } } },
        lockAt: { type: 'string', description: 'ISO 8601 deadline when changes close. Defaults to the account\'s approval window (24 h).' },
        approvalHours: { type: 'number', description: 'Alternative to lockAt: hours from now.' },
        notifyCustomer: { type: 'boolean', description: 'Email the customer their order page. Default true.' },
        metadata: { type: 'object', description: 'Anything to keep with the order and get back.' },
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              externalId: { type: 'string' },
              name: { type: 'string' },
              quantity: { type: 'integer' },
              product: {
                type: 'object',
                description: 'A catalog key (see list_products) with optional shape and pages, or width/height (+unit "in"|"mm", bleed, safe, pages). Extra fields (sku, stock, finish) are kept.',
                properties: {
                  key: { type: 'string' },
                  shape: { type: 'string' },
                  name: { type: 'string' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                  unit: { type: 'string', enum: ['in', 'mm'] },
                  bleed: { type: 'number' },
                  safe: { type: 'number' },
                  pages: { type: ['array', 'integer'], items: { type: 'string' } },
                },
              },
              artwork: artworkSchema,
              notes: { type: 'string' },
            },
            required: ['product'],
          },
        },
      },
      required: ['jobs'],
    },
  },
  {
    name: 'list_orders',
    description: 'Orders on the account, newest first.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, since: { type: 'string', description: 'ISO date: only orders changed since.' } } },
  },
  { name: 'get_order', description: 'An order with all its jobs. id is the order id or your externalId.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'get_job',
    description: 'One job: status, deadline, every page (final, proof, current, original image URLs and print-check results), open customer marks, and links including the print file.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  { name: 'get_job_events', description: 'The job\'s timeline, oldest first.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'add_artwork',
    description: 'Add artwork to a job. Each file becomes the newest version of its page and is print-checked.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, artwork: artworkSchema }, required: ['id', 'artwork'] },
  },
  {
    name: 'send_proof',
    description: 'Show the customer the current version of every page and email them. Say what changed and why, plainly — it builds trust.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        message: { type: 'string' },
        changes: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: ['fit', 'resolution', 'spelling', 'safe', 'bleed', 'content', 'other'] }, text: { type: 'string' } }, required: ['text'] } },
        notify: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  { name: 'approve_job', description: 'Approve on the customer\'s behalf (e.g. they approved by phone).', inputSchema: { type: 'object', properties: { id: { type: 'string' }, by: { type: 'string' } }, required: ['id'] } },
  { name: 'message_customer', description: 'Post a message on the job\'s timeline and email it to the customer.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, message: { type: 'string' } }, required: ['id', 'message'] } },
  {
    name: 'set_job_status',
    description: 'Move a job along after approval: locked, in_production, complete, cancelled, or back to received.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['locked', 'in_production', 'complete', 'cancelled', 'received'] } }, required: ['id', 'status'] },
  },
  {
    name: 'set_deadline',
    description: 'Change when changes close, for a whole order (orderId) or one job (jobId). lockAt is ISO 8601, or null for no deadline.',
    inputSchema: { type: 'object', properties: { orderId: { type: 'string' }, jobId: { type: 'string' }, lockAt: { type: ['string', 'null'] } }, required: ['lockAt'] },
  },
] as const

type Args = Record<string, unknown>

async function callTool(who: Caller, name: string, a: Args): Promise<unknown> {
  const id = String(a.id ?? '')
  switch (name) {
    case 'list_products':
      return productsOp()
    case 'create_order':
      return (await createOrderOp(who, a, 'mcp')).order
    case 'list_orders':
      return listOrdersOp(who, { limit: typeof a.limit === 'number' ? a.limit : undefined, since: a.since })
    case 'get_order':
      return getOrderOp(who, id)
    case 'get_job':
      return getJobOp(who, id)
    case 'get_job_events':
      return eventsOp(who, id)
    case 'add_artwork':
      return addArtworkOp(who, id, a.artwork)
    case 'send_proof':
      return sendProofOp(who, id, a)
    case 'approve_job':
      return approveOp(who, id, a.by)
    case 'message_customer':
      return messageOp(who, id, a.message)
    case 'set_job_status':
      return setStatusOp(who, id, a.status)
    case 'set_deadline':
      return setDeadlineOp(who, { orderId: a.orderId as string | undefined, jobId: a.jobId as string | undefined }, a.lockAt)
    default:
      throw new OrderError(`Unknown tool "${name}".`, 404)
  }
}

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const PROTOCOL = '2025-06-18'

/** One JSON-RPC message in, its reply out (or null for a notification). */
export async function handleRpc(who: Caller, msg: RpcRequest): Promise<Record<string, unknown> | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg.id === undefined) return null // notifications (e.g. notifications/initialized) need no reply

  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kanthink-print', version: '1.0.0' },
        instructions:
          'Kanthink print orders. Create an order with jobs (artwork + product), then each job has a shared proof page the customer approves before the deadline. Use get_job to read status and final files; send_proof after fixing artwork.',
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      const args = (msg.params?.arguments as Args) ?? {}
      try {
        const out = await callTool(who, name, args)
        return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool failed.'
        return reply({ content: [{ type: 'text', text: message }], isError: true })
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`)
  }
}
