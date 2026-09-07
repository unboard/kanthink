/**
 * Where a mention starts, given where the caret is.
 *
 * Pulled out of the composer because the arithmetic here is what went wrong: the
 * picker recomputed only while typing, so moving the caret left `startIndex`
 * pointing at a span the user had since left. Selecting from the list then rewrote
 * that stale span — a name landing in the middle of an unrelated word.
 *
 * Small enough to test exhaustively, and worth it: every off-by-one here is a
 * corrupted message rather than a visual glitch.
 */

export interface MentionMatch {
  /** Text between the trigger character and the caret. */
  query: string;
  /** Index of the trigger character itself, so the composer can replace from there. */
  startIndex: number;
}

/**
 * Find an in-progress mention immediately before the caret, or null.
 *
 * A mention only counts at the start of the text or after whitespace — an email
 * address and a C# reference are not mentions. The query runs to the caret and may
 * not contain whitespace or a second trigger.
 */
export function detectMentionAtCaret(
  value: string,
  caret: number,
  trigger: '@' | '#'
): MentionMatch | null {
  if (caret < 0 || caret > value.length) return null;

  const before = value.slice(0, caret);
  // Escaped because '#' is inert in a character class but '@' and future triggers
  // should not have to be reasoned about individually.
  const t = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = before.match(new RegExp(`(?:^|\\s)${t}([^\\s${t}]*)$`));
  if (!match) return null;

  const query = match[1];
  return { query, startIndex: caret - query.length - 1 };
}

/**
 * The text to insert for a completed mention.
 *
 * The trailing space is there so you can keep typing. Completing a mention in the
 * middle of a sentence already has whitespace after it, and adding a second one
 * read as a typo.
 */
export function mentionInsertText(label: string, trigger: '@' | '#', after: string): string {
  return `${trigger}${label}${/^\s/.test(after) ? '' : ' '}`;
}
