/**
 * Gemini Decision client: the request shape the API expects (model as models/…, a
 * shared input, questions keyed by our ids) and reading answers back, including cost.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { choiceOf, decide, scoreOf, yes } from '../lib/ai/decide'

afterEach(() => vi.unstubAllGlobals())

describe('decide', () => {
  it('sends one shared input with keyed questions and reads the answers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      answers: {
        work: { type: 'noul', noul: 0.12, confidence: 0.88 },
        glad: { type: 'score', score: 2.7, probabilities: { 0: 0.1 }, confidence: 0.4 },
        who: { type: 'choice', choice: 'claude', probabilities: { app: 0.3, claude: 0.7 }, confidence: 0.7 },
      },
      usage: { total_input_tokens: 25_000 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await decide({
      apiKey: 'k',
      input: 'ideas…',
      questions: {
        work: { type: 'noul', instructions: 'Day job?' },
        glad: { type: 'score', instructions: 'How glad?', criteria: ['no', 'yes'] },
        who: { type: 'choice', instructions: 'Who builds it?', criteria: { app: 'Kan', claude: 'Claude Code' } },
      },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('models/gemini-decision-1')
    expect(Object.keys(body.questions)).toEqual(['work', 'glad', 'who'])
    expect(yes(r.answers.work)).toBe(0.12)
    expect(scoreOf(r.answers.glad)).toBe(2.7)
    expect(choiceOf(r.answers.who, 'app')).toBe('claude')
    expect(r.costCents).toBe(1) // 25k tokens at $0.10/M rounds up to a cent
  })

  it('throws with the status on an error, and falls back when an answer is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })))
    await expect(decide({ apiKey: 'k', input: 'x', questions: { a: { type: 'noul', instructions: 'q' } } })).rejects.toThrow(/400/)
    expect(yes(undefined, 1)).toBe(1)
    expect(choiceOf(undefined, 'app')).toBe('app')
  })
})
