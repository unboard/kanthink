/**
 * Card API route handler tests
 *
 * Tests the core card operations (create, update, delete) by calling
 * the route handlers directly with mocked auth and database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth before importing routes
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      columns: { findFirst: vi.fn() },
      cards: { findFirst: vi.fn(), findMany: vi.fn() },
      tasks: { findMany: vi.fn() },
      users: { findFirst: vi.fn() },
      channels: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn() })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}))

vi.mock('@/lib/api/permissions', () => ({
  requirePermission: vi.fn(),
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

vi.mock('@/lib/notifications/createNotification', () => ({
  createNotificationForChannelMembers: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db/activity', () => ({
  logChannelActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('nanoid', () => ({
  nanoid: () => 'test-nanoid-123',
}))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api/permissions'

// Helper to create a minimal NextRequest
function createRequest(method: string, body?: Record<string, unknown>): Request {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new Request('http://localhost/api/channels/ch1/cards', init)
}

describe('POST /api/channels/:id/cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { POST } = await import('@/app/api/channels/[id]/cards/route')
    const req = createRequest('POST', { columnId: 'col1', title: 'Test' })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Not authenticated')
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)

    const { POST } = await import('@/app/api/channels/[id]/cards/route')
    const req = createRequest('POST', { columnId: 'col1' })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('required')
  })

  it('returns 400 when columnId is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)

    const { POST } = await import('@/app/api/channels/[id]/cards/route')
    const req = createRequest('POST', { title: 'Test' })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(400)
  })

  it('returns 404 when column not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.query.columns.findFirst).mockResolvedValue(undefined as any)

    const { POST } = await import('@/app/api/channels/[id]/cards/route')
    const req = createRequest('POST', { columnId: 'col1', title: 'Test' })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(404)
  })

  it('creates a card successfully', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.query.columns.findFirst).mockResolvedValue({ id: 'col1', channelId: 'ch1' } as any)
    vi.mocked(db.query.cards.findMany).mockResolvedValue([])
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn() } as any)
    vi.mocked(db.query.cards.findFirst).mockResolvedValue({
      id: 'test-nanoid-123',
      channelId: 'ch1',
      columnId: 'col1',
      title: 'New Card',
      messages: [],
      source: 'manual',
      position: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)

    const { POST } = await import('@/app/api/channels/[id]/cards/route')
    const req = createRequest('POST', { columnId: 'col1', title: 'New Card' })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'ch1' }) })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.card).toBeDefined()
    expect(data.card.title).toBe('New Card')
  })
})

describe('DELETE /api/channels/:id/cards/:cardId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { DELETE } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('DELETE')
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.query.cards.findFirst).mockResolvedValue(undefined as any)

    const { DELETE } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('DELETE')
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(404)
  })

  it('deletes a card successfully', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.query.cards.findFirst).mockResolvedValue({
      id: 'card1',
      channelId: 'ch1',
      columnId: 'col1',
      title: 'Card To Delete',
      position: 0,
      isArchived: false,
    } as any)
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn() } as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn() })) } as any)

    const { DELETE } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('DELETE')
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})

describe('PATCH /api/channels/:id/cards/:cardId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const { PATCH } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('PATCH', { title: 'Updated' })
    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)
    vi.mocked(db.query.cards.findFirst).mockResolvedValue(undefined as any)

    const { PATCH } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('PATCH', { title: 'Updated' })
    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(404)
  })

  it('updates a card title successfully', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as any)
    vi.mocked(requirePermission).mockResolvedValue(undefined as any)

    const existingCard = {
      id: 'card1',
      channelId: 'ch1',
      columnId: 'col1',
      title: 'Old Title',
      assignedTo: null,
    }

    // First call: existingCard lookup, second call: after update
    vi.mocked(db.query.cards.findFirst)
      .mockResolvedValueOnce(existingCard as any)
      .mockResolvedValueOnce({
        ...existingCard,
        title: 'New Title',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      } as any)

    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn() })) } as any)

    const { PATCH } = await import('@/app/api/channels/[id]/cards/[cardId]/route')
    const req = createRequest('PATCH', { title: 'New Title' })
    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'ch1', cardId: 'card1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.card.title).toBe('New Title')
  })
})
