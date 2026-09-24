/**
 * Screen a shroom's generated cards against what this user has already said no to.
 *
 * The rejection history already goes into the generating prompt, and the LLM still
 * repeats itself — being told "not this" in a long prompt is a weak signal next to
 * the pull of the channel's topic. So the check happens again afterwards, as a
 * judgment rather than a generation: for each draft, Jev answers "would this user
 * reject it?" given the cards they rejected (and why), the cards this shroom made
 * that they kept, and what is already on the board.
 *
 * Paired with over-generation — the shroom drafts a few more than it needs — the
 * run keeps its card count and the review column gets the best of the drafts
 * rather than the first of them. Select instead of generate.
 *
 * Quiet by design: with no Jev key, no history to learn from, or a failed call,
 * the drafts pass through untouched, as they did before this existed.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { askJev, isJevConfigured, type NoulQuestion } from '@/lib/jev/client';
import type { CardInput, CardRejection } from '@/lib/types';

/** At or above this, a draft is held back even if it leaves the run short. */
export const HOLD_BACK_AT = 0.7;

const REASON_TEXT: Record<string, string> = {
  too_similar: 'too similar to cards already there',
  not_relevant: 'not relevant to the channel',
  too_vague: 'too vague',
  not_for_me: 'not for me',
  already_know: 'already knew this',
};

/** Worth the extra drafts only when there is something to screen against. */
export function shouldScreen(rejections: CardRejection[]): boolean {
  return isJevConfigured() && rejections.length > 0;
}

/** How many drafts to ask for when screening, so the run can still fill `count`. */
export function draftCountFor(count: number): number {
  return count + Math.min(3, Math.max(2, Math.ceil(count / 2)));
}

export interface ScreenResult {
  cards: CardInput[];
  heldBack: { title: string; probability: number }[];
  /** False when Jev was not consulted and the drafts passed through as they were. */
  screened: boolean;
}

/**
 * Pick which drafts to keep: drop anything likely to be rejected, then take the
 * `keep` least likely in the order the shroom wrote them.
 */
export function chooseDrafts(
  drafts: CardInput[],
  probabilities: number[],
  keep: number,
): Pick<ScreenResult, 'cards' | 'heldBack'> {
  const scored = drafts.map((card, i) => ({ card, i, p: probabilities[i] ?? 0 }));
  const heldBack = scored.filter((d) => d.p >= HOLD_BACK_AT);
  const kept = scored
    .filter((d) => d.p < HOLD_BACK_AT)
    .sort((a, b) => a.p - b.p)
    .slice(0, keep)
    // Back to the shroom's own order, which usually carries meaning.
    .sort((a, b) => a.i - b.i);
  return {
    cards: kept.map((d) => d.card),
    heldBack: heldBack.map((d) => ({ title: d.card.title, probability: Number(d.p.toFixed(3)) })),
  };
}

export async function screenGeneratedCards(opts: {
  channelId: string;
  channelName: string;
  channelPurpose?: string;
  instructionCardId: string;
  shroomTitle: string;
  shroomInstructions: string;
  rejections: CardRejection[];
  drafts: CardInput[];
  keep: number;
}): Promise<ScreenResult> {
  const { drafts, keep, rejections } = opts;
  const passThrough: ScreenResult = { cards: drafts.slice(0, keep), heldBack: [], screened: false };
  if (!shouldScreen(rejections) || drafts.length === 0) return passThrough;

  const [kept, onBoard] = await Promise.all([
    // What this shroom made that survived review — the other half of the taste signal.
    db.query.cards.findMany({
      where: and(eq(cards.createdByInstructionId, opts.instructionCardId), eq(cards.isPendingReview, false)),
      columns: { title: true },
      orderBy: [desc(cards.createdAt)],
      limit: 15,
    }),
    db.query.cards.findMany({
      where: and(eq(cards.channelId, opts.channelId), eq(cards.isPendingReview, false), eq(cards.isArchived, false)),
      columns: { title: true },
      orderBy: [desc(cards.updatedAt)],
      limit: 40,
    }),
  ]);

  const keys = drafts.map((_, i) => `draft_${i + 1}`);
  const listed: Record<string, unknown> = {};
  const questions: Record<string, NoulQuestion> = {};
  keys.forEach((key, i) => {
    listed[key] = { title: drafts[i].title, content: (drafts[i].initialMessage || '').slice(0, 600) };
    questions[key] = {
      type: 'noul',
      instructions:
        `Would this user reject \`drafts.${key}\` if it appeared in their review column? Judge it against ` +
        '`rejected_before` (and the reasons given), `kept_before`, and `already_on_board`.',
      criteria: {
        true: 'It repeats or closely resembles something they rejected, has the same flaw they gave as a reason, or duplicates a card already on the board.',
        false: 'It is new to them and fits the kind of card they have kept.',
      },
    };
  });

  const result = await askJev(
    {
      channel: { name: opts.channelName, purpose: opts.channelPurpose?.slice(0, 400) },
      shroom: { title: opts.shroomTitle, instructions: opts.shroomInstructions.slice(0, 600) },
      rejected_before: rejections.slice(0, 25).map((r) => ({
        title: r.rejectedCardTitle,
        reason: r.reason ? REASON_TEXT[r.reason] ?? r.reason : undefined,
        feedback: r.feedback?.slice(0, 200),
      })),
      kept_before: kept.map((c) => c.title),
      already_on_board: onBoard.map((c) => c.title),
      drafts: listed,
    },
    questions,
    // Not a live conversation; a shroom run can afford to wait longer than voice.
    { label: 'shroom taste', timeoutMs: 8000 },
  );
  if (!result) return passThrough;

  const probabilities = keys.map((key) => result.answers[key]?.noul ?? 0);
  const chosen = chooseDrafts(drafts, probabilities, keep);

  console.log('[jev-taste]', JSON.stringify({
    shroom: opts.shroomTitle,
    drafts: drafts.map((d, i) => [d.title, Number(probabilities[i].toFixed(3))]),
    kept: chosen.cards.length,
    heldBack: chosen.heldBack.length,
    ms: result.latencyMs,
  }));

  return { ...chosen, screened: true };
}
