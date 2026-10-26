import { describe, expect, it } from 'vitest'
import { advance } from '../lib/playground/buildProgress'
import { formatElapsed } from '../components/kan/KanTrace'

describe('build progress', () => {
  it('finishes the running step when the next one starts', () => {
    let steps = advance([], 'Working out what to change', 1)
    steps = advance(steps, 'Writing the change with Gemini Pro', 2)
    expect(steps).toEqual([
      { label: 'Working out what to change', status: 'done', at: 1 },
      { label: 'Writing the change with Gemini Pro', status: 'running', at: 2 },
    ])
  })

  it('reads elapsed time the way a person would say it', () => {
    expect(formatElapsed(6_400)).toBe('6s')
    expect(formatElapsed(125_000)).toBe('2m 05s')
  })
})
