import { describe, it, expect } from 'vitest';
import { isUsableSummary } from '@/lib/shrooms/generateSummary';

/**
 * A shroom with no summary falls back to its raw instructions, which is readable.
 * A shroom with a *bad* summary shows that instead, and there is no way back from the
 * board. So the bar for saving one is "better than the fallback", not "non-empty".
 */
describe('shroom summary validation', () => {
  it('accepts a normal one-line description', () => {
    expect(isUsableSummary('Sorts new bookmarks into topic columns and tags each one.')).toBe(true);
    expect(isUsableSummary('Reads every card in Inbox and adds a short analysis.')).toBe(true);
  });

  it('rejects the fragments seen on real cards', () => {
    // Both of these were live on the board: a clipped instruction and an echoed rule.
    expect(isUsableSummary('..."/restating the title.')).toBe(false);
    expect(isUsableSummary('/restating the title.')).toBe(false);
  });

  it('rejects an answer that starts mid-sentence', () => {
    expect(isUsableSummary('and then adds a note to the card.')).toBe(false);
    expect(isUsableSummary('…adds a note to the card.')).toBe(false);
    expect(isUsableSummary('"Sorts the cards')).toBe(false);
  });

  it('rejects the prompt rules echoed back as an answer', () => {
    expect(isUsableSummary('One sentence, third person, present tense.')).toBe(false);
    expect(isUsableSummary('Write in third person and do not restate the title.')).toBe(false);
  });

  it('rejects lengths that cannot be a card description', () => {
    expect(isUsableSummary('')).toBe(false);
    expect(isUsableSummary('Sorts it.')).toBe(false);
    expect(isUsableSummary('A'.repeat(401))).toBe(false);
  });
});
