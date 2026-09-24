/**
 * When a change to your boards should make Kanwatch read stretches again.
 *
 * A read records the board it was made against; a different signature later means
 * "re-read the stretches you haven't answered". So the signature must change for
 * anything that changes what a stretch could be filed under — and nothing else, or
 * every page view would re-read the whole day.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { boardSignature, type BoardChannel } from '@/lib/kanwatch/board'

const board: BoardChannel[] = [
  { id: 'a', name: 'AI Builder', description: 'AI design tools', folder: 'MyCreativeShop' },
  { id: 'b', name: 'Backyard birds', description: null, folder: null },
]

describe('boardSignature', () => {
  it('changes when a channel is added', () => {
    expect(boardSignature([...board, { id: 'c', name: 'Work', description: null, folder: 'MyCreativeShop' }]))
      .not.toBe(boardSignature(board))
  })

  it('changes when a channel moves into a folder', () => {
    const moved = board.map((c) => (c.id === 'b' ? { ...c, folder: 'Home' } : c))
    expect(boardSignature(moved)).not.toBe(boardSignature(board))
  })

  it('changes when a channel is renamed or re-described', () => {
    expect(boardSignature(board.map((c) => (c.id === 'a' ? { ...c, name: 'MCS AI Builder' } : c)))).not.toBe(boardSignature(board))
    expect(boardSignature(board.map((c) => (c.id === 'b' ? { ...c, description: 'Sightings' } : c)))).not.toBe(boardSignature(board))
  })

  it('ignores order, so recent activity reordering channels re-reads nothing', () => {
    expect(boardSignature([...board].reverse())).toBe(boardSignature(board))
  })
})
