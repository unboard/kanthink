import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { teachesShroom } from '@/lib/shrooms/rejections'

describe('teachesShroom', () => {
  it('learns from a rejection that gives a reason', () => {
    expect(teachesShroom({ reason: 'too_vague' })).toBe(true)
  })

  it('learns from a note even without a reason', () => {
    expect(teachesShroom({ reason: null, feedback: 'we already did this' })).toBe(true)
  })

  it('does not learn from a bare rejection, such as Reject all with no reason', () => {
    expect(teachesShroom({ reason: null, feedback: null })).toBe(false)
    expect(teachesShroom({ reason: null, feedback: '   ' })).toBe(false)
  })
})
