import { describe, it, expect } from 'vitest'
import { stripEchoedContent, cardContentStrings } from '@/lib/shrooms/stripEchoedContent'

/**
 * The case this exists for: a bookmark card whose scraped page was reproduced by an
 * "analyze this bookmark" shroom, then appended underneath the original — so the page
 * showed up twice on the card and twice in the run email.
 */
const SCRAPED_PAGE = `Skip to content
Navigation Menu

jitsucom / jitsu

What is Jitsu?
Jitsu collects event data from your websites, apps and servers, and delivers it to your data warehouse and to whatever other tools you use.
It covers the same ground as Segment, but it is MIT-licensed and self-hostable, so the whole pipeline can run inside your own infrastructure.`

const USER_NOTE = `I'm wondering if this could be an alternative to mixpanel, which is what we use for my creative shop.`

describe('stripEchoedContent', () => {
  it('drops a verbatim copy of the card and keeps the new analysis', () => {
    const note = `${SCRAPED_PAGE}

${USER_NOTE}

---

## Deep Analysis
Jitsu is an open-source event pipeline with a native MCP server, which is the interesting part.`

    const result = stripEchoedContent(note, [SCRAPED_PAGE, USER_NOTE])

    expect(result).toBe(
      '## Deep Analysis\nJitsu is an open-source event pipeline with a native MCP server, which is the interesting part.'
    )
  })

  it('matches echoed content across a markdown/HTML mismatch', () => {
    // Existing content written by an earlier shroom run is HTML; the new note is markdown.
    const existingHtml = `<p>What is Jitsu?<br>Jitsu collects event data from your websites, apps and servers, and delivers it to your data warehouse and to whatever other tools you use.<br>It covers the same ground as Segment, but it is MIT-licensed and self-hostable, so the whole pipeline can run inside your own infrastructure.</p>`
    const note = `What is Jitsu?
Jitsu collects event data from your websites, apps and servers, and delivers it to your data warehouse and to whatever other tools you use.
It covers the same ground as Segment, but it is MIT-licensed and self-hostable, so the whole pipeline can run inside your own infrastructure.

**Takeaway:** the MCP server is what separates this from RudderStack and PostHog.`

    expect(stripEchoedContent(note, [existingHtml])).toBe(
      '**Takeaway:** the MCP server is what separates this from RudderStack and PostHog.'
    )
  })

  it('returns empty when the note is nothing but an echo', () => {
    // Writing no message beats writing a duplicate one.
    expect(stripEchoedContent(SCRAPED_PAGE, [SCRAPED_PAGE])).toBe('')
  })

  it('leaves a genuine note alone', () => {
    const note = `## Deep Analysis
Jitsu covers ingestion only, so a Mixpanel replacement also needs a warehouse and a chart layer.
The free tier is 200k events/month, which is enough to prove this out at no cost.`

    expect(stripEchoedContent(note, [SCRAPED_PAGE, USER_NOTE])).toBe(note)
  })

  it('does not cut on a single coincidental line match', () => {
    const shared = 'It covers the same ground as Segment, but it is MIT-licensed and self-hostable, so the whole pipeline can run inside your own infrastructure.'
    const note = `${shared}

That one line is worth restating, but everything after it is new analysis about cost.`

    expect(stripEchoedContent(note, [SCRAPED_PAGE])).toBe(note)
  })

  it('ignores short lines when deciding whether this is an echo', () => {
    // "Skip to content" and "Navigation Menu" are scraped noise — carried along inside an
    // echoed run, but never enough on their own to eat the top of a real note.
    const note = `Skip to content
Navigation Menu

Here is my genuinely new take on why this matters for analytics.`

    expect(stripEchoedContent(note, [SCRAPED_PAGE])).toBe(note)
  })

  it('handles cards with no existing content', () => {
    expect(stripEchoedContent('A fresh note.', [])).toBe('A fresh note.')
  })
})

describe('cardContentStrings', () => {
  it('collects the title and every message body', () => {
    expect(
      cardContentStrings({
        title: 'GitHub - jitsucom/jitsu',
        messages: [{ content: 'first' }, { content: '' }, { content: 'second' }],
      })
    ).toEqual(['GitHub - jitsucom/jitsu', 'first', 'second'])
  })

  it('survives a card with no messages', () => {
    expect(cardContentStrings({ title: 'Bare card', messages: null })).toEqual(['Bare card'])
  })
})
