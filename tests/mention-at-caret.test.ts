/**
 * Mention detection at the caret
 *
 * The bug this guards: the composer only recomputed the picker while typing, so
 * moving the caret left startIndex pointing at a span the user had left behind, and
 * choosing from the list rewrote that stale span.
 */
import { describe, it, expect } from 'vitest'
import { detectMentionAtCaret, mentionInsertText } from '../lib/chat/mentionAtCaret'

describe('detectMentionAtCaret', () => {
  it('finds a mention being typed at the end', () => {
    const v = 'hey @du'
    expect(detectMentionAtCaret(v, v.length, '@')).toEqual({ query: 'du', startIndex: 4 })
  })

  it('finds a bare trigger with no query yet', () => {
    const v = 'hey @'
    expect(detectMentionAtCaret(v, v.length, '@')).toEqual({ query: '', startIndex: 4 })
  })

  it('finds one at the very start of the message', () => {
    expect(detectMentionAtCaret('@kan', 4, '@')).toEqual({ query: 'kan', startIndex: 0 })
  })

  it('anchors to the caret, not the end of the text', () => {
    // Caret sits right after "@du"; there is more text beyond it.
    const v = 'hey @du and then some more'
    expect(detectMentionAtCaret(v, 7, '@')).toEqual({ query: 'du', startIndex: 4 })
  })

  it('returns null when the caret has moved away from the mention', () => {
    // This is the actual bug: text still contains "@du", but the caret is elsewhere.
    const v = 'hey @du and then some more'
    expect(detectMentionAtCaret(v, v.length, '@')).toBeNull()
  })

  it('closes once whitespace follows the trigger', () => {
    const v = 'hey @ '
    expect(detectMentionAtCaret(v, v.length, '@')).toBeNull()
  })

  it('ignores a trigger glued to a word, so emails are not mentions', () => {
    const v = 'mail me at dustin@example'
    expect(detectMentionAtCaret(v, v.length, '@')).toBeNull()
  })

  it('ignores a second trigger inside the query', () => {
    const v = 'hey @du@st'
    expect(detectMentionAtCaret(v, v.length, '@')).toBeNull()
  })

  it('works the same for card mentions', () => {
    const v = 'see #Bird'
    expect(detectMentionAtCaret(v, v.length, '#')).toEqual({ query: 'Bird', startIndex: 4 })
    expect(detectMentionAtCaret('C# is fine', 10, '#')).toBeNull()
  })

  it('treats the two triggers independently', () => {
    const v = 'hey @du'
    expect(detectMentionAtCaret(v, v.length, '#')).toBeNull()
  })

  it('handles a caret after a newline', () => {
    const v = 'first line\n@ka'
    expect(detectMentionAtCaret(v, v.length, '@')).toEqual({ query: 'ka', startIndex: 11 })
  })

  it('returns null for an out-of-range caret rather than throwing', () => {
    expect(detectMentionAtCaret('hey @du', 999, '@')).toBeNull()
    expect(detectMentionAtCaret('hey @du', -1, '@')).toBeNull()
  })

  it('reports a startIndex that actually points at the trigger', () => {
    const v = 'a @b c @de'
    const m = detectMentionAtCaret(v, v.length, '@')
    expect(m).not.toBeNull()
    expect(v[m!.startIndex]).toBe('@')
    // Replacing from startIndex through the caret must consume exactly the mention.
    expect(v.slice(m!.startIndex, v.length)).toBe('@de')
  })
})

describe('mentionInsertText', () => {
  it('adds a trailing space when the caret is at the end', () => {
    expect(mentionInsertText('Dustin', '@', '')).toBe('@Dustin ')
  })

  it('does not double the space when one already follows', () => {
    expect(mentionInsertText('Dustin', '@', ' and then')).toBe('@Dustin')
  })

  it('treats a following newline as existing whitespace', () => {
    expect(mentionInsertText('Dustin', '@', '\nnext line')).toBe('@Dustin')
  })

  it('adds a space before adjacent text', () => {
    expect(mentionInsertText('Dustin', '@', 'rest')).toBe('@Dustin ')
  })

  it('works for card mentions too', () => {
    expect(mentionInsertText('Bird App', '#', '')).toBe('#Bird App ')
  })
})
