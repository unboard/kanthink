/**
 * Remove the card's own content when a modify shroom hands it back to us.
 *
 * A `modify` shroom's `content` is *appended* to the card thread as a new note — it is
 * not a replacement body. The prompt now says so, but models asked to "update the
 * description with a deep analysis" still sometimes reproduce the whole card verbatim
 * and put their new material underneath. Appending that duplicates a bookmark's entire
 * scraped page on the card, and again in the run email.
 *
 * So the prompt is the fix and this is the seatbelt: drop the echoed run at the top of
 * the note and keep what's genuinely new.
 */

/** Below this, a line is too generic to be evidence of an echo ("## Overview", "- Yes"). */
const SUBSTANTIVE_LENGTH = 25

/**
 * How much has to line up before we trust that this is an echo at all.
 *
 * Measured in characters rather than lines because a copied card is a *bulk* of text, and
 * counting lines punishes content that arrives as a few long paragraphs. Two matching
 * lines is the floor regardless: one shared sentence is a quotation, not a reproduction.
 */
const MIN_ECHOED_LINES = 2
const MIN_ECHOED_CHARS = 150

/**
 * One comparable line.
 *
 * Existing card content can be HTML (written by an earlier shroom run) while the new
 * note is markdown, so both sides are flattened to bare words before they meet.
 */
function normalizeLine(line: string): string {
  return line
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, ' ')
    .replace(/[*_`~#>]/g, '')
    .replace(/^\s*(?:[-+*]|\d+\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Split content into comparable lines, treating HTML block breaks as newlines. */
function toLines(content: string): string[] {
  return content.split(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>|\n/i)
}

/** A line that carries no information about whether we're looking at an echo. */
function isSkippable(normalized: string): boolean {
  return normalized.length === 0 || /^[-=_\s]+$/.test(normalized)
}

/**
 * Strip a leading verbatim echo of `existingContents` from `note`.
 *
 * Returns the note unchanged unless at least `MIN_ECHOED_LINES` substantive lines at the
 * top are all found in the existing content — one coincidental match shouldn't be able to
 * eat the top of a legitimate note. When the note turns out to be *nothing but* an echo,
 * the result is empty: writing no message beats writing a duplicate one.
 */
export function stripEchoedContent(note: string, existingContents: string[]): string {
  if (!note.trim() || existingContents.length === 0) return note

  const echoed = new Set<string>()
  for (const content of existingContents) {
    for (const line of toLines(content ?? '')) {
      const normalized = normalizeLine(line)
      if (normalized.length >= SUBSTANTIVE_LENGTH) echoed.add(normalized)
    }
  }
  if (echoed.size === 0) return note

  const lines = note.split('\n')
  let cut = 0
  let matched = 0
  let matchedChars = 0

  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeLine(lines[i])
    if (isSkippable(normalized)) continue
    // A short line inside an echoed run (a heading, a stray "Sign in") is carried along,
    // but on its own it is never enough to justify cutting.
    if (normalized.length < SUBSTANTIVE_LENGTH) continue
    if (!echoed.has(normalized)) break
    matched++
    matchedChars += normalized.length
    cut = i + 1
  }

  if (matched < MIN_ECHOED_LINES || matchedChars < MIN_ECHOED_CHARS) return note

  // Drop the separator the model left between the copy and its own contribution.
  const remainder = lines.slice(cut)
  while (remainder.length > 0 && isSkippable(normalizeLine(remainder[0]))) remainder.shift()

  return remainder.join('\n').trim()
}

/** All the text already on a card, as the strings `stripEchoedContent` compares against. */
export function cardContentStrings(card: {
  title?: string
  messages?: { content?: string }[] | null
}): string[] {
  const contents = (card.messages ?? []).map((m) => m?.content ?? '').filter(Boolean)
  return card.title ? [card.title, ...contents] : contents
}
