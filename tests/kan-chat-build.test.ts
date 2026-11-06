import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
const { agreedTo } = await import('@/lib/kan/city/talk')

const bot = (content: string) => ({ type: 'ai_response', content })
const boss = (content: string) => ({ type: 'note', content })

describe('building an app from a bot chat', () => {
  it('a bare yes to an open question builds nothing (the Kan & Me chat)', () => {
    const said = [
      bot('Hey Hodg! With "Kan as a first-class collaborator" ready to pull, what kind of app should we sprout first to actually make Kan feel like a true partner here?'),
      boss('Yes!'),
    ]
    expect(agreedTo('Kan & Me', said)).toBe(false)
  })

  it('a yes to an app the bot named and described builds it', () => {
    const said = [bot('How about a Tip Splitter: enter the bill and how many of you, and it shows what each person owes. Want it?'), boss('yes')]
    expect(agreedTo('Tip Splitter', said)).toBe(true)
  })

  it('asking for one in their own words builds it', () => {
    expect(agreedTo('Seed Tracker', [bot('Hi!'), boss('make me a little app to track what seeds I planted')])).toBe(true)
  })
})
