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
 * ## Why titles alone were not enough
 *
 * The first version of this compared titles. That catches the maths-app case, where
 * each attempt reuses the same words, and misses the more common one: the user
 * describes a feature, then describes *more of the same feature*, and the model
 * titles the second card from the new half. "Centralized App Directory" and "Visual
 * App Gallery With Thumbnails" share no distinguishing word at all and are plainly
 * the same idea — which is obvious from what was said, not from what it was called.
 *
 * So there are two signals now:
 *
 *   - **Title overlap**, as before. Strong enough on its own.
 *   - **Idea overlap** — title plus the body text — which catches the same feature
 *     described twice in different words.
 *
 * And two outcomes, not one, which is the more important change. A `certain` match
 * redirects into the existing card without asking. A `possible` one is handed back
 * as a question for the user to answer.
 *
 * That split exists because bag-of-words similarity over short spoken text is not
 * good enough to decide with. On the case that prompted this it separates cleanly —
 * 0.29 against the card it duplicates, 0.0 against an unrelated one in the same
 * session — but two people's descriptions of unrelated work will sometimes agree on
 * "launch" and "manage" and "specific" and score just as well. Acting on that would
 * quietly lose a card somebody asked for. Asking about it costs one sentence, and
 * one sentence is what a voice conversation is made of anyway.
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
 * Idea overlap strong enough to act on without asking.
 *
 * Half the shorter description's distinguishing words, and at least four of them.
 * This is deliberately high: silently folding someone's new card into an old one is
 * the one failure here that loses work, so it has to be nearly beyond doubt.
 */
export const CERTAIN_IDEA_THRESHOLD = 0.5;

/**
 * Idea overlap worth asking about, for a card made in this same conversation.
 *
 * Deliberately low, and this is where the real work happens. Measured on the case
 * that prompted it — one description of an app directory split across two cards —
 * the two texts share 0.29 of the shorter one's vocabulary, while an unrelated
 * request in the same session shares 0.0. That is a clean separation but not a
 * confident one, because short spoken text and generic verbs ("launch", "manage")
 * will occasionally push two unrelated things over any bar set this low.
 *
 * So this threshold does not decide anything. It asks. The session prior — the
 * assistant made a card a minute ago and is being asked for another — justifies one
 * short question; it does not justify overruling the user. Asking when the answer
 * was "yes, separate" costs a sentence. Guessing wrong costs a duplicate card, or a
 * card that was asked for and never made.
 */
export const SESSION_QUESTION_THRESHOLD = 0.2;

/** Outside this conversation, only a near-identical idea is anyone's business. */
export const RECENT_IDEA_THRESHOLD = 0.5;

/**
 * A comparison needs this many distinguishing words on each side to mean anything.
 *
 * Without it, two cards whose only shared word survived the noise filter score 1.0
 * and look identical.
 */
const MIN_TOKENS = 3;

/**
 * And this many words actually in common before a score is worth reading.
 *
 * A ratio alone is happy to call two four-word notes a perfect match on one shared
 * word. Everything here is short text, so the absolute count is the guard that a
 * ratio cannot be.
 */
const MIN_SHARED = 3;
const MIN_SHARED_CERTAIN = 4;

/** Body text beyond this is detail, not identity, and only adds noise. */
const CONTENT_SAMPLE_CHARS = 800;

/**
 * Words carrying no distinguishing weight in a card title. "App" and "idea" are
 * here because the assistant reaches for them constantly — two titles agreeing only
 * that something is an app idea agree on nothing.
 */
const NOISE_WORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'my', 'our',
  'app', 'apps', 'idea', 'ideas', 'card', 'new', 'concept', 'draft', 'thing',
]);

/**
 * Everything above, plus the filler that only appears once there is a body to read.
 *
 * These are the words a spoken description is made of — "want", "should", "like",
 * "really" — and they are the same words in every description, so they would make
 * any two bodies look alike.
 */
const BODY_NOISE_WORDS = new Set([
  ...NOISE_WORDS,
  'is', 'it', 'that', 'this', 'be', 'can', 'could', 'would', 'should', 'want', 'wants',
  'wanted', 'need', 'needs', 'have', 'has', 'had', 'will', 'just', 'also', 'so', 'but',
  'if', 'when', 'then', 'there', 'their', 'they', 'them', 'you', 'your', 'we', 'us',
  'me', 'i', 'im', 'ive', 'are', 'was', 'were', 'been', 'do', 'does', 'did', 'get',
  'gets', 'got', 'make', 'makes', 'made', 'like', 'really', 'very', 'some', 'any',
  'all', 'more', 'most', 'kind', 'sort', 'maybe', 'probably', 'actually', 'basically',
  'thing', 'things', 'stuff', 'way', 'ways', 'lot', 'lots', 'from', 'into', 'about',
  'where', 'what', 'which', 'how', 'why', 'who', 'as', 'at', 'by', 'not', 'no', 'yes',
  'okay', 'ok', 'well', 'right', 'one', 'two', 'now', 'here', 'out', 'up', 'down',
  'over', 'each', 'other', 'own', 'see', 'look', 'looks', 'think', 'know', 'let',
  'lets', 'able', 'use', 'used', 'using', 'add', 'adds', 'added',
]);

/** Lowercase, strip punctuation and possessives, drop noise words. */
export function titleTokens(title: string): string[] {
  return normalize(title).filter((w) => !NOISE_WORDS.has(w));
}

/** The same, over body text, with the heavier filler list. */
export function contentTokens(content: string): string[] {
  return normalize(content.slice(0, CONTENT_SAMPLE_CHARS))
    .filter((w) => w.length > 2 && !BODY_NOISE_WORDS.has(w));
}

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** An idea as the tool sees it: what it is called, and what was said about it. */
export interface IdeaInput {
  title: string;
  content?: string | null;
}

function asIdea(idea: string | IdeaInput): IdeaInput {
  return typeof idea === 'string' ? { title: idea } : idea;
}

/** Title words plus body words, as one set — everything known about an idea. */
export function ideaTokens(idea: string | IdeaInput): Set<string> {
  const { title, content } = asIdea(idea);
  const tokens = new Set(titleTokens(title));
  if (content) for (const word of contentTokens(content)) tokens.add(word);
  return tokens;
}

/**
 * Share of the smaller set also present in the larger.
 *
 * Containment rather than Jaccard: "Lennon Math" and "Lennon Cat Math Adventure
 * Story" are the same idea getting more specific, which is exactly the pattern
 * here, and Jaccard punishes that for growing.
 */
function containment(left: Set<string>, right: Set<string>): { score: number; shared: number } {
  if (left.size === 0 || right.size === 0) return { score: 0, shared: 0 };
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  if (smaller.size < MIN_TOKENS) return { score: 0, shared: 0 };
  let shared = 0;
  for (const word of smaller) if (larger.has(word)) shared++;
  return { score: shared / smaller.size, shared };
}

/** Do two titles name the same idea? */
export function isLikelyDuplicateTitle(a: string, b: string): boolean {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (left.size === 0 || right.size === 0) return false;

  // Short titles are the common case and must still work, so the MIN_TOKENS floor
  // that containment() applies to bodies is deliberately not applied here.
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const word of smaller) if (larger.has(word)) shared++;

  return shared / smaller.size >= DUPLICATE_TITLE_THRESHOLD;
}

/** How sure the tool is, and therefore what it should do about it. */
export type DuplicateConfidence = 'certain' | 'possible';

export interface RecentCard {
  id: string;
  title: string;
  channelId: string;
  createdAt: Date | null;
  /** The card's first message, where there is one. Only loaded for session cards. */
  content?: string | null;
  /** True when this assistant made the card in the conversation now running. */
  fromThisSession?: boolean;
}

export type DuplicateHit = RecentCard & { confidence: DuplicateConfidence };

/**
 * The card this new idea is a duplicate of, if any.
 *
 * Checks across channels on purpose: in the session that prompted this, the second
 * and third cards landed in a different channel than the first, so a same-channel
 * check would have missed the very case it exists for.
 *
 * Cards from this conversation are considered first, and every one of them is
 * examined before falling back to the merely recent — a same-session `possible`
 * beats a stranger's `certain`, because it is the case the user is actually living
 * through right now.
 */
export function findDuplicateCard(
  idea: string | IdeaInput,
  recent: RecentCard[],
  now: number = Date.now()
): DuplicateHit | null {
  const input = asIdea(idea);
  const inputTokens = ideaTokens(input);

  let possible: DuplicateHit | null = null;

  for (const card of recent) {
    const at = card.createdAt?.getTime();
    // Session cards are exempt from the window: a conversation that has run for
    // twenty minutes is still one conversation.
    if (!card.fromThisSession && (at === undefined || now - at > DUPLICATE_WINDOW_MS)) continue;

    if (isLikelyDuplicateTitle(input.title, card.title)) {
      return { ...card, confidence: 'certain' };
    }

    const { score, shared } = containment(
      inputTokens,
      ideaTokens({ title: card.title, content: card.content }),
    );

    // Strong enough to act on, wherever it came from.
    if (score >= CERTAIN_IDEA_THRESHOLD && shared >= MIN_SHARED_CERTAIN) {
      return { ...card, confidence: 'certain' };
    }

    if (possible) continue;
    if (card.fromThisSession) {
      if (score >= SESSION_QUESTION_THRESHOLD && shared >= MIN_SHARED) {
        possible = { ...card, confidence: 'possible' };
      }
    } else if (score >= RECENT_IDEA_THRESHOLD && shared >= MIN_SHARED) {
      possible = { ...card, confidence: 'possible' };
    }
  }

  return possible;
}
