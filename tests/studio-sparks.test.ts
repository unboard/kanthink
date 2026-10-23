import { describe, expect, it } from 'vitest'
import { buildSparkPrompt, cleanLabel, freshIdeas, parseSparkIdeas, sparkContent, trimLookAround } from '../lib/studio/sparkEngine'
import { formatSignals, isNoiseDomain, learnedLines, type SparkSignals } from '../lib/studio/signals'
import { decideNudge, nudgedKeys, shareWhereOf, stageSince, type MomentumFacts } from '../lib/studio/momentum'

const signals: SparkSignals = {
  signals: [
    { kind: 'read', label: 'What if a calendar could stand up?', url: 'https://x.com/a/status/1', minutes: 5 },
    { kind: 'bookmark', label: 'PDF into an animated web book', url: 'https://reddit.com/r/x/comments/abc1234' },
    { kind: 'time', label: '4over.com', minutes: 109 },
    { kind: 'channel', label: 'Print studio', note: 'prompt-to-print design' },
  ],
  history: [{ title: 'Sub Plan Writer', stage: 'Dropped' }],
  passes: ['Sub Plan Writer: not for me'],
  learned: ['nothing for kids'],
}

const reply = JSON.stringify([
  {
    title: 'Proof in Hand', hook: 'Proofs customers can hold, in 3D.', kind: 'feature', sparkedBy: ['R1', 'T1', 'Z9'],
    idea: 'Show each proof as the real object.', whyYou: 'You run a print platform.',
    money: { who: 'Printers', how: 'an add-on per order', price: '$29 a month' },
    firstMove: 'Put up the test page and send it to three printers.', nextSteps: ['a', 'b', 'c', 'd'], shareWhere: 'r/printing',
  },
  { title: 'No sources', hook: 'x', kind: 'app', sparkedBy: ['Z1'], firstMove: 'y' },
  { title: 'sub plan writer', hook: 'again', kind: 'app', sparkedBy: ['B1'], firstMove: 'y' },
])

describe('spark signals', () => {
  it('numbers each signal so the model can cite it, by kind', () => {
    const { text, byId } = formatSignals(signals)
    expect(text).toContain('[R1] What if a calendar could stand up?')
    expect(text).toContain('[T1] 4over.com 109 min')
    expect([...byId.keys()]).toEqual(['R1', 'B1', 'T1', 'C1'])
  })

  it('ignores dev servers and plumbing when reading where time goes', () => {
    expect(isNoiseDomain('app.localhost:3100')).toBe(true)
    expect(isNoiseDomain('missionprint.local.myprintsite.com:3100')).toBe(true)
    expect(isNoiseDomain('127.0.0.1')).toBe(true)
    expect(isNoiseDomain('4over.com')).toBe(false)
  })

  it('reads the lasting preferences off the end of the brief', () => {
    expect(learnedLines('Brief\n\nLearned from conversations:\n- more print\n- nothing for kids')).toEqual(['more print', 'nothing for kids'])
    expect(learnedLines('no section')).toEqual([])
  })

  it('tells the model what was passed on and what is already on the board', () => {
    const prompt = buildSparkPrompt(signals, formatSignals(signals).text)
    expect(prompt).toContain('Sub Plan Writer: not for me')
    expect(prompt).toContain('- nothing for kids')
    expect(prompt).toMatch(/first move/i)
  })
})

describe('spark engine', () => {
  const known = new Set(formatSignals(signals).byId.keys())

  it('keeps only ideas that cite something real of theirs, and only the ids that exist', () => {
    const ideas = parseSparkIdeas('```json\n' + reply + '\n```', known)
    expect(ideas.map((i) => i.title)).toEqual(['Proof in Hand', 'sub plan writer'])
    expect(ideas[0].sparkedBy).toEqual(['R1', 'T1'])
    expect(ideas[0].nextSteps).toHaveLength(3)
  })

  it('turns raw page titles into short link labels', () => {
    expect(cleanLabel('(1) codila on X: "Anthropic designer released a prompt that turns Opus &amp; Fable into a motion studio" / X'))
      .toBe('codila: Anthropic designer released a prompt that turns Opus &…')
    expect(cleanLabel('Cloud API — Melissa Documentation')).toBe('Cloud API — Melissa Documentation')
  })

  it('keeps the competitor check to whole bullets, without the preamble', () => {
    const long = 'Here are the closest tools:\n\n*   **A** ($9): ' + 'x'.repeat(500) + '\n*   **B** ($19): ' + 'y'.repeat(500) + '\n*   **C** ($29): ' + 'z'.repeat(500)
    const out = trimLookAround(long)!
    expect(out.startsWith('*   **A**')).toBe(true)
    expect(out).toContain('**B**')
    expect(out).not.toContain('**C**')
  })

  it('returns nothing for a reply that is not JSON', () => {
    expect(parseSparkIdeas('Sorry, I cannot help with that.', known)).toEqual([])
  })

  it('never brings back an idea already on the board', () => {
    const ideas = freshIdeas(parseSparkIdeas(reply, known), signals.history)
    expect(ideas.map((i) => i.title)).toEqual(['Proof in Hand'])
  })

  it('writes the hook first, then what set it off, the money and the first move', () => {
    const { byId } = formatSignals(signals)
    const [idea] = parseSparkIdeas(reply, known)
    const text = sparkContent(idea, byId, '- Nothing close exists')
    expect(text.split('\n')[0]).toBe('Proofs customers can hold, in 3D.')
    expect(text).toContain('[What if a calendar could stand up?](https://x.com/a/status/1)')
    expect(text).toContain('your 109 min on 4over.com')
    expect(text).toContain('Test at $29 a month.')
    expect(text).toContain('**First move (today):** Put up the test page')
    expect(shareWhereOf([{ content: text }])).toBe('r/printing')
    expect(text).not.toMatch(/^#/m)
  })
})

describe('momentum', () => {
  const facts = (f: Partial<MomentumFacts>): MomentumFacts => ({ title: 'Proof in Hand', stage: 'testing', days: 0, views: 0, reserves: 0, nudged: new Set(), ...f })

  it('says nothing on the day the test page goes up', () => {
    expect(decideNudge(facts({ days: 0 }))).toBeNull()
  })

  it('pushes to share a page nobody has seen, with a post, and reminds of the first move', () => {
    const n = decideNudge(facts({ days: 1, views: 2, openFirstMove: 'Send it to three printers.' }))
    expect(n?.key).toBe('share')
    expect(n?.withPost).toBe(true)
    expect(n?.text).toContain('Send it to three printers.')
  })

  it('says build it once three people reserve, ahead of anything else', () => {
    expect(decideNudge(facts({ days: 9, views: 40, reserves: 3 }))?.key).toBe('build')
  })

  it('reads views without reserves as a pitch problem, and three quiet weeks as time to decide', () => {
    expect(decideNudge(facts({ days: 8, views: 25 }))?.key).toBe('reword')
    expect(decideNudge(facts({ days: 8, views: 6 }))?.key).toBe('share-again')
    expect(decideNudge(facts({ days: 22, views: 6 }))?.key).toBe('decide')
  })

  it('says each thing once', () => {
    expect(decideNudge(facts({ days: 1, nudged: new Set(['share']) }))).toBeNull()
    expect(decideNudge(facts({ reserves: 4, nudged: new Set(['build']) }))).toBeNull()
  })

  it('nudges a built app that has sat for two days to ship', () => {
    expect(decideNudge(facts({ stage: 'ready', days: 1 }))).toBeNull()
    expect(decideNudge(facts({ stage: 'ready', days: 2, reserves: 2 }))?.text).toMatch(/2 people reserved/)
  })

  it('counts days from the last stage move, not from its own nudges', () => {
    const messages = [
      { type: 'ai_response', content: 'Test page is up', createdAt: '2026-10-01T10:00:00Z' },
      { type: 'ai_response', content: 'share it', nudgeKey: 'share', createdAt: '2026-10-05T10:00:00Z' },
      { type: 'question', content: 'hm', createdAt: '2026-10-06T10:00:00Z' },
    ]
    expect(stageSince(messages, new Date('2026-09-01')).toISOString()).toBe('2026-10-01T10:00:00.000Z')
    expect([...nudgedKeys(messages)]).toEqual(['share'])
  })
})
