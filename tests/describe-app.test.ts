/**
 * What Kan can say about an app when asked out loud.
 *
 * Reported as "you seem blind to it. in voice mode" — asking about an app that
 * lives on a card got nothing back: not its thread, not whether it was a draft.
 *
 * The cause was a gap between two tools rather than a broken one. app_audience
 * answered how a PUBLISHED app was doing — people, revenue, feedback — and nothing
 * answered what an app WAS. So a draft, which is most of them while you are still
 * working, had no tool pointing at it, and show_card read the card's own thread and
 * stopped without mentioning the app built from it.
 *
 * These pin the sentence that gets read aloud. The route fetches the release and
 * hands it in, so this stays a pure function and the wording is testable.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { describeApp } from '../lib/playground/describeApp'
import type { AppRow, AppVersion } from '../lib/playground/appRelease'

const app = (over: Partial<AppRow> = {}): AppRow => ({
  id: 'app-1',
  title: 'Product Launch Simulator',
  code: 'const A = 2',
  messages: [],
  lastNotes: null,
  publishedVersionId: null,
  isPublic: false,
  shareToken: null,
  paywallEnabled: false,
  priceAmount: null,
  priceCurrency: 'usd',
  priceInterval: null,
  ...over,
} as unknown as AppRow)

const release = (version: number, code: string) =>
  ({ version, code }) as Pick<AppVersion, 'version' | 'code'>

const msg = (type: string, content: string) => ({ type, content })

describe('what state the app is in', () => {
  it('names a draft as a draft rather than saying nothing', () => {
    // The case with no tool at all before. Most apps are here while being built.
    const out = describeApp(app(), null, { full: true })
    expect(out).toContain('Product Launch Simulator')
    expect(out).toMatch(/a draft, never published/)
  })

  it('distinguishes never built from built but unpublished', () => {
    expect(describeApp(app({ code: null }), null, { full: true })).toMatch(/not built yet/)
  })

  it('names the live version when published', () => {
    const out = describeApp(
      app({ publishedVersionId: 'v2', isPublic: true, shareToken: 'tok123' }),
      release(2, 'const A = 2'),
      { full: true },
    )
    expect(out).toMatch(/published, serving version 2/)
    expect(out).toContain('kanthink.com/play/tok123')
  })

  it('explains unpublished as taken down, not lost', () => {
    const out = describeApp(
      app({ publishedVersionId: 'v2', isPublic: false, shareToken: 'tok123' }),
      release(2, 'const A = 2'),
      { full: true },
    )
    expect(out).toMatch(/unpublished/)
    expect(out).toMatch(/still the chosen release/)
    // No link offered while the link is closed.
    expect(out).not.toContain('kanthink.com/play/tok123')
  })

  it('says when the draft has moved past what customers have', () => {
    const out = describeApp(
      app({ publishedVersionId: 'v1', isPublic: true, code: 'const A = 99' }),
      release(1, 'const A = 1'),
      { full: true },
    )
    expect(out).toMatch(/changes nobody can see yet/)
  })

  it('stays quiet about unpublished changes when there are none', () => {
    const out = describeApp(
      app({ publishedVersionId: 'v1', isPublic: true, code: 'const A = 1' }),
      release(1, 'const A = 1'),
      { full: true },
    )
    expect(out).not.toMatch(/changes nobody can see/)
  })

  it('mentions the price when the app charges', () => {
    const out = describeApp(
      app({ paywallEnabled: true, priceAmount: 400, priceInterval: 'month' }),
      null,
      { full: true },
    )
    expect(out).toContain('$4.00/mo')
  })
})

describe('the app thread, which was unreachable', () => {
  const thread = [
    msg('question', 'Make the download button actually work please'),
    msg('ai_response', 'Replaced the fallback with a real client-side blob download.'),
    msg('note', 'Still shows the old copy on mobile, worth a look'),
  ]

  it('reads the app thread back, labelled by who said what', () => {
    const out = describeApp(app({ messages: thread as never }), null, { full: true })
    expect(out).toContain('App thread')
    expect(out).toContain('[User asked] Make the download button actually work please')
    expect(out).toContain('[Kan] Replaced the fallback')
    expect(out).toContain('[Note] Still shows the old copy')
  })

  it('trims to the recent turns and says it did, because this is read aloud', () => {
    const many = Array.from({ length: 20 }, (_, i) => msg('note', `message number ${i + 1} here`))
    const out = describeApp(app({ messages: many as never }), null, { full: true })
    expect(out).toMatch(/last 12 of 20 messages/)
    expect(out).toContain('message number 20 here')
    expect(out).not.toContain('message number 5 here')
  })

  it('gives only a glimpse when several apps are being listed at once', () => {
    const many = Array.from({ length: 20 }, (_, i) => msg('note', `message number ${i + 1} here`))
    const out = describeApp(app({ messages: many as never }), null, { full: false })
    expect(out).toMatch(/last 3 of 20 messages/)
  })

  it('says the thread is empty rather than omitting it when asked about one app', () => {
    // Silence reads as "I cannot see it", which is the complaint being fixed.
    expect(describeApp(app(), null, { full: true })).toContain('App thread: (empty)')
  })

  it('carries the last build note, which is usually the answer to "what changed"', () => {
    const out = describeApp(app({ lastNotes: 'Swapped the export to a real download.' }), null, { full: true })
    expect(out).toContain('Last build: Swapped the export to a real download.')
  })
})

/**
 * Wiring guards. The describer being right is no use if nothing calls it, and the
 * model cannot call a tool it was never told about.
 */
describe('the tool is reachable from the places that were blind', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('show_card reports the apps built from the card', () => {
    const src = read('app/api/voice/action/route.ts')
    expect(src).toMatch(/case 'show_card'/)
    expect(src).toMatch(/describeAppRow\(cardApp/)
  })

  it('show_app exists as an action', () => {
    expect(read('app/api/voice/action/route.ts')).toMatch(/case 'show_app'/)
  })

  it('show_app is declared to the live voice model', () => {
    const src = read('components/voice/LiveVoiceMode.tsx')
    expect(src).toMatch(/name: 'show_app'/)
    // The distinction that was missing — drafts have to be named explicitly.
    expect(src).toMatch(/draft, published, or unpublished/)
  })

  it('operator chat can route it too', () => {
    const src = read('app/api/operator-chat/route.ts')
    expect(src).toMatch(/\*\*show_app\*\*/)
    expect(src).toMatch(/'app_audience', 'show_app'/)
  })

  it('the voice prompt tells Kan not to claim blindness', () => {
    const src = read('lib/ai/voicePrompt.ts')
    expect(src).toMatch(/You are NOT blind to an app/)
    expect(src).toMatch(/Never say you cannot see an app/)
  })
})
