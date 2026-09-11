/**
 * Voice duplicate-card detection
 *
 * Cases drawn from a real voice session where one idea became three cards in two
 * minutes. The titles here are verbatim from that transcript.
 */
import { describe, it, expect } from 'vitest'
import {
  isLikelyDuplicateTitle,
  findDuplicateCard,
  titleTokens,
  contentTokens,
  DUPLICATE_WINDOW_MS,
} from '../lib/voice/duplicateCard'

describe('titleTokens', () => {
  it('drops possessives, punctuation and filler', () => {
    expect(titleTokens("Lennon's Cozy Cat Math App Idea")).toEqual([
      'lennon', 'cozy', 'cat', 'math',
    ])
  })

  it('leaves a title made only of filler with nothing to match on', () => {
    expect(titleTokens('A new app idea')).toEqual([])
  })
})

describe('isLikelyDuplicateTitle', () => {
  it('catches the three cards one maths idea actually produced', () => {
    const a = "Lennon's Math Practice App"
    const b = "Lennon's Cozy Cat Math App Idea"
    const c = "Lennon's Cat Math Adventure app"
    expect(isLikelyDuplicateTitle(a, c)).toBe(true)
    expect(isLikelyDuplicateTitle(b, c)).toBe(true)
  })

  it('treats a title getting more specific as the same idea', () => {
    expect(isLikelyDuplicateTitle('Lennon Math', 'Lennon Cat Math Adventure Story')).toBe(true)
  })

  it('leaves genuinely different ideas that share a word alone', () => {
    expect(isLikelyDuplicateTitle('Bird Color Palette', 'Bird Feeder Log')).toBe(false)
    expect(isLikelyDuplicateTitle('Q3 Pricing Review', 'Q3 Hiring Plan')).toBe(false)
  })

  it('never matches on filler alone', () => {
    expect(isLikelyDuplicateTitle('A new app idea', 'Another app idea')).toBe(false)
  })

  it('is symmetric', () => {
    const a = "Lennon's Math Practice App"
    const c = "Lennon's Cat Math Adventure app"
    expect(isLikelyDuplicateTitle(a, c)).toBe(isLikelyDuplicateTitle(c, a))
  })
})

describe('findDuplicateCard', () => {
  const now = Date.now()
  const recent = [
    {
      id: 'card-1',
      title: "Lennon's Math Practice App",
      channelId: 'playground',
      createdAt: new Date(now - 60_000),
    },
  ]

  it('finds the earlier card for the same idea', () => {
    const hit = findDuplicateCard("Lennon's Cat Math Adventure app", recent, now)
    expect(hit?.id).toBe('card-1')
  })

  it('matches across channels — the real duplicates landed somewhere else', () => {
    const hit = findDuplicateCard("Lennon's Cat Math Adventure app", recent, now)
    expect(hit?.channelId).toBe('playground')
  })

  it('ignores anything outside the window, so tomorrow is a fresh start', () => {
    const stale = [{ ...recent[0], createdAt: new Date(now - DUPLICATE_WINDOW_MS - 1000) }]
    expect(findDuplicateCard("Lennon's Cat Math Adventure app", stale, now)).toBeNull()
  })

  it('returns null when nothing is close', () => {
    expect(findDuplicateCard('Quarterly budget review', recent, now)).toBeNull()
  })

  it('tolerates a card with no timestamp rather than throwing', () => {
    const undated = [{ ...recent[0], createdAt: null }]
    expect(findDuplicateCard("Lennon's Cat Math Adventure app", undated, now)).toBeNull()
  })
})

/**
 * The case the title check could never see.
 *
 * Reported Sep 11 2026: one continuous description of a visual app directory became
 * two cards, because the second half of the idea got a title made of different
 * words. Nothing in "Centralized App Directory" and "Visual App Gallery With
 * Thumbnails" overlaps; everything in what was said about them does.
 */
describe('an idea described in parts, in one conversation', () => {
  const directory = {
    id: 'card-directory',
    title: 'Centralized App Directory',
    channelId: 'work',
    createdAt: new Date(),
    content:
      'A central dedicated area within Kanthink to access and manage every app generated ' +
      'from cards. A single location to view every app built on personal or collaborative ' +
      'boards, with filter and sort by channel, recently updated or alphabetically, so you ' +
      'can find and launch a specific app without navigating individual cards.',
    fromThisSession: true,
  }

  it('catches the second half of the same idea, and asks about it', () => {
    // 0.29 overlap: enough to notice, not enough to overrule someone with. The card
    // is not created, and the model is told to put one short question to the user.
    const hit = findDuplicateCard(
      {
        title: 'Visual App Gallery With Thumbnails',
        content:
          'Every app should get a generated image as its thumbnail so people can understand ' +
          'the app at a glance. On the app page you would see thumbnails and could filter and ' +
          'sort them, launch a specific app, and see which ones are published.',
      },
      [directory],
    )
    expect(hit?.id).toBe('card-directory')
    expect(hit?.confidence).toBe('possible')
  })

  it('redirects without asking when the two are unmistakably the same', () => {
    // Near-identical wording needs no question — this is the maths-app case, told
    // in body text rather than in titles.
    const hit = findDuplicateCard(
      {
        title: 'One place for all my apps',
        content:
          'A central dedicated area within Kanthink to access and manage every app generated ' +
          'from cards, with filter and sort by channel so you can find and launch a specific app.',
      },
      [directory],
    )
    expect(hit?.id).toBe('card-directory')
    expect(hit?.confidence).toBe('certain')
  })

  it('leaves a genuinely different request in the same session alone', () => {
    const hit = findDuplicateCard(
      {
        title: 'Fix the mobile drag handle',
        content:
          'Long-pressing a card on my phone scrolls the column instead of picking the card up. ' +
          'It only happens in portrait and only on the first column.',
      },
      [directory],
    )
    expect(hit).toBeNull()
  })

  it('never redirects silently on a same-session text match', () => {
    // Everything the session threshold catches comes back as a question. Nothing
    // reaches 'certain' on this signal alone, which is the whole point of it.
    const hit = findDuplicateCard(
      {
        title: 'Publishing flow',
        content:
          'Let me publish a specific app and manage whether it is public. Filter published ones.',
      },
      [directory],
    )
    expect(hit?.confidence).toBe('possible')
  })

  it('stays out of the way of cards from other conversations', () => {
    // Same words, but nothing says this came from the conversation now running, so
    // body text is not trusted at the session threshold.
    const elsewhere = { ...directory, fromThisSession: false }
    const hit = findDuplicateCard(
      {
        title: 'Fix the mobile drag handle',
        content: 'Long-pressing a card scrolls the column instead of picking it up.',
      },
      [elsewhere],
    )
    expect(hit).toBeNull()
  })

  it('still applies inside a session that has run past the recency window', () => {
    // A conversation is one train of thought however long it has been going.
    const old = { ...directory, createdAt: new Date(Date.now() - DUPLICATE_WINDOW_MS - 60_000) }
    const hit = findDuplicateCard(
      {
        title: 'Visual App Gallery With Thumbnails',
        content:
          'Every app should get a generated image thumbnail so people can understand the app. ' +
          'On the app page you see thumbnails and filter and sort them, and launch a specific app.',
      },
      [old],
    )
    expect(hit?.id).toBe('card-directory')
    expect(hit?.confidence).toBe('possible')
  })

  it('prefers this conversation over an unrelated recent card', () => {
    const stranger = {
      id: 'card-stranger',
      title: 'Centralized App Directory',
      channelId: 'someone-else',
      createdAt: new Date(),
    }
    const hit = findDuplicateCard(
      {
        title: 'Visual App Gallery With Thumbnails',
        content:
          'Generated image thumbnails for every app, on an app page you can filter and sort, ' +
          'so you can launch a specific app and see which are published.',
      },
      [directory, stranger],
    )
    expect(hit?.id).toBe('card-directory')
  })
})

describe('token extraction over body text', () => {
  it('drops the filler a spoken description is mostly made of', () => {
    expect(contentTokens('I really think we should just make it more like that')).toEqual([])
  })

  it('keeps the words that actually identify something', () => {
    expect(contentTokens('Generated thumbnails on the app directory page')).toEqual([
      'generated', 'thumbnails', 'directory', 'page',
    ])
  })
})

describe('two cards with one word in common', () => {
  it('does not call them the same idea', () => {
    // Without a floor on how many distinguishing words a comparison needs, a
    // one-word overlap scores a perfect 1.0 and looks identical.
    const hit = findDuplicateCard(
      { title: 'Invoicing', content: 'Send invoices to clients' },
      [{
        id: 'c1',
        title: 'Clients',
        channelId: 'work',
        createdAt: new Date(),
        content: 'A list of clients',
        fromThisSession: true,
      }],
    )
    expect(hit).toBeNull()
  })
})
