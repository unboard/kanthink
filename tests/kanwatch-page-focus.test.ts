/**
 * A stretch's focus comes from its pages.
 *
 * Judging a whole stretch at once gave every page in it the same label, so a feed
 * read inside a work session counted as work. Pages are read one by one now, and
 * the stretch is only the sum of them.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { focusFromPages } from '@/lib/kanwatch/judge'

describe('focusFromPages', () => {
  it('is the share of read time spent on the priority', () => {
    expect(focusFromPages([
      { seconds: 540, focus: 'priority' },
      { seconds: 180, focus: 'not_work' },
    ])).toBe(75)
  })

  it('counts other work as off the priority', () => {
    expect(focusFromPages([{ seconds: 60, focus: 'priority' }, { seconds: 60, focus: 'work' }])).toBe(50)
  })

  it('leaves unclear and unread pages out either way', () => {
    expect(focusFromPages([{ seconds: 60, focus: 'priority' }, { seconds: 600, focus: 'unclear' }, { seconds: 600, focus: null }])).toBe(100)
    expect(focusFromPages([{ seconds: 60, focus: 'unclear' }])).toBeNull()
  })
})
