/**
 * Channel API route handler tests
 *
 * Tests channel creation and update operations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth before importing routes
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  isAdmin: vi.fn(() => false),
}))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      channels: { findFirst: vi.fn(), findMany: vi.fn() },
      columns: { findMany: vi.fn() },
      cards: { findMany: vi.fn() },
      tasks: { findMany: vi.fn() },
      instructionCards: { findMany: vi.fn() },
      userChannelOrg: { findMany: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn() })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}))

vi.mock('@/lib/api/permissions', () => ({
  requirePermission: vi.fn(),
  getChannelPermission: vi.fn(),
  getUserChannelsWithSharerInfo: vi.fn(),
  PermissionError: class PermissionError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))

vi.mock('@/lib/db/ensure-schema', () => ({
  ensureSchema: vi.fn(),
}))

vi.mock('nanoid', () => ({
  nanoid: () => 'test-nanoid-456',
}))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api/permissions'

function createRequest(method: string, body?: Record<string, unknown>): Request {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new Request('http://localhost/api/channels', init)
}

describe('POST /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { POST } = await import('@/app/api/channels/route')
    const req = createRequest('POST', { name: 'Test' })
    const res = await POST(req as any)

    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)

    const { POST } = await import('@/app/api/channels/route')
    const req = createRequest('POST', {})
    const res = await POST(req as any)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Name is required')
  })

  it('creates a channel with default columns', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn() } as any)
    vi.mocked(db.query.userChannelOrg.findMany).mockResolvedValue([])
    vi.mocked(db.query.channels.findFirst).mockResolvedValue({
      id: 'test-nanoid-456',
      name: 'My Channel',
      ownerId: 'user1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)
    vi.mocked(db.query.columns.findMany).mockResolvedValue([
      { id: 'col1', name: 'Inbox', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'col2', name: 'Interesting', position: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 'col3', name: 'Useful', position: 2, createdAt: new Date(), updatedAt: new Date() },
      { id: 'col4', name: 'Archive', position: 3, createdAt: new Date(), updatedAt: new Date() },
    ] as any)

    const { POST } = await import('@/app/api/channels/route')
    const req = createRequest('POST', { name: 'My Channel' })
    const res = await POST(req as any)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.channel).toBeDefined()
    expect(data.channel.name).toBe('My Channel')
    expect(data.columns).toHaveLength(4)
  })
})

describe('PATCH /api/channels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { PATCH } = await import('@/app/api/channels/[id]/route')
    const req = createRequest('PATCH', { name: 'Updated' })
    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(401)
  })

  it('updates channel name successfully', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1', email: 'test@test.com' } } as any)
    vi.mocked(requirePermission).mockResolvedValue({ role: 'owner', isOwner: true } as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn() })) } as any)
    vi.mocked(db.query.channels.findFirst).mockResolvedValue({
      id: 'ch1',
      name: 'Updated Name',
      ownerId: 'user1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)

    const { PATCH } = await import('@/app/api/channels/[id]/route')
    const req = createRequest('PATCH', { name: 'Updated Name' })
    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.channel.name).toBe('Updated Name')
  })
})

describe('DELETE /api/channels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { DELETE } = await import('@/app/api/channels/[id]/route')
    const req = createRequest('DELETE')
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(401)
  })

  it('deletes a channel successfully', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1', email: 'test@test.com' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn() } as any)

    const { DELETE } = await import('@/app/api/channels/[id]/route')
    const req = createRequest('DELETE')
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
