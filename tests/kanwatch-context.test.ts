/**
 * How Kan holds Kanwatch in conversation.
 *
 * Kanwatch is the most personal thing Kan knows. Given a summary of someone's day, a
 * chatty model will open with it, comment on their focus, and speculate about gaps —
 * which turns a helpful colleague into a monitor. These rules are what stop that, so
 * an edit that drops one should fail here, not in someone's voice session.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/api/permissions', () => ({ getUserChannels: vi.fn() }))

import { KANWATCH_RULES } from '@/lib/kanwatch/context'

describe('Kanwatch context rules', () => {
  it('keeps it background: never opened with, recited or summarised unasked', () => {
    expect(KANWATCH_RULES).toMatch(/DO NOT:/)
    expect(KANWATCH_RULES).toMatch(/Open a conversation or a reply with it/)
    expect(KANWATCH_RULES).toMatch(/summarise their day unasked/)
  })

  it('never judges how time was spent unless asked', () => {
    expect(KANWATCH_RULES).toMatch(/Never judge, scold or praise their habits/)
  })

  it('never guesses what private time was', () => {
    expect(KANWATCH_RULES).toMatch(/Guess, ask about, or hint at what their private time was/)
  })

  it('does not surface flagged pages just because they are there', () => {
    expect(KANWATCH_RULES).toMatch(/Mention a flagged page or its open question just because it is here/)
  })

  it('still says when to use it, so it is not dead weight', () => {
    expect(KANWATCH_RULES).toMatch(/When they ask about their day/)
    expect(KANWATCH_RULES).toMatch(/what to work on next/)
    expect(KANWATCH_RULES).toMatch(/refer to something they read or watched/)
  })
})
