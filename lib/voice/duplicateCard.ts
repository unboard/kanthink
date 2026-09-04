/**
 * Catching the same idea being carded twice in one voice session.
 *
 * Observed in a real session: one idea for a maths app became three cards in two
 * minutes — "Lennon's Math Practice App", "Lennon's Cozy Cat Math App Idea",
 * "Lennon's Cat Math Adventure app" — because the user kept adding detail and the
 * model read each addition as a fresh request. Detail added to an idea should land
 * in the card's thread, not spawn a sibling.
 *
 * The model is told this in its prompt, but a prompt is a request and this is the
 * kind of mistake that is cheap to prevent and annoying to clean up, so the tool
 * enforces it too.
 *
 * Deliberately narrow: only titles that are largely the same words, only within
 * minutes, only for cards the assistant itself made. Two cards a day apart, or two
 * genuinely different ideas that share a word, are none of its business.
 */

/** How recently a card must have been made to count as the same train of thought. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Share of the shorter title's words that must also appear in the longer one.
 *
 * 0.6 keeps "Lennon's Cat Math Adventure app" against "Lennon's Math Practice App"
 * (lennon/math/app out of lennon/cat/math/adventure/app = 0.6) while leaving
 * "Bird Color Palette" against "Bird Feeder Log" (bird alone = 0.33) alone.
 */
export const DUPLICATE_TITLE_THRESHOLD = 0.6;

/**
 * Words carrying no distinguishing weight in a card title. "App" and "idea" are
 * here because the assistant reaches for them constantly — two titles agreeing only
 * that something is an app idea agree on nothing.
 */
const NOISE_WORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'my', 'our',
  'app', 'apps', 'idea', 'ideas', 'card', 'new', 'concept', 'draft', 'thing',
]);

/** Lowercase, strip punctuation and possessives, drop noise words. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w));
}

/**
 * Do two titles name the same idea?
 *
 * Containment against the shorter title rather than Jaccard: "Lennon Math" and
 * "Lennon Cat Math Adventure Story" are the same idea getting more specific, which
 * is exactly the pattern here, and Jaccard punishes that for growing.
 */
export function isLikelyDuplicateTitle(a: string, b: string): boolean {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (left.size === 0 || right.size === 0) return false;

  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const word of smaller) if (larger.has(word)) shared++;

  return shared / smaller.size >= DUPLICATE_TITLE_THRESHOLD;
}

export interface RecentCard {
  id: string;
  title: string;
  channelId: string;
  createdAt: Date | null;
}

/**
 * The card this new title is a duplicate of, if any.
 *
 * Checks across channels on purpose: in the session that prompted this, the second
 * and third cards landed in a different channel than the first, so a same-channel
 * check would have missed the very case it exists for.
 */
export function findDuplicateCard(
  title: string,
  recent: RecentCard[],
  now: number = Date.now()
): RecentCard | null {
  for (const card of recent) {
    const at = card.createdAt?.getTime();
    if (at === undefined || now - at > DUPLICATE_WINDOW_MS) continue;
    if (isLikelyDuplicateTitle(title, card.title)) return card;
  }
  return null;
}
