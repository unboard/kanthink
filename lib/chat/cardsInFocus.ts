/**
 * Which cards is this chat message about? Resolved before the LLM sees it.
 *
 * Chat prompts carry the board as a list of titles and one-line summaries, which is
 * enough to name a card but not to answer anything about it — "what did we decide
 * on the pricing card?" lives in that card's thread, which the prompt never had.
 *
 * So Jev reads the message (and the turns before it, for "it" and "that one")
 * against a shortlist of the caller's own cards, with one yes/no question per card
 * in a single call. The ones it is confident about are loaded in full — thread,
 * tasks, where they sit — and handed to the LLM as the context that matters,
 * rather than the whole workspace cut short.
 *
 * Quiet by design: no key, a timeout, or no confident match all return null and
 * the chat runs exactly as it did before.
 */

import { asc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cards, tasks } from '@/lib/db/schema';
import { askJev, isJevConfigured, type NoulQuestion } from '@/lib/jev/client';
import { cardCandidates, type Access } from '@/lib/voice/resolveReference';

const MIN_PROBABILITY = 0.6;
const MAX_CARDS = 3;
// Enough of a thread to answer from; the newest messages matter most.
const THREAD_TAIL = 12;
const MESSAGE_CHARS = 800;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CardsInFocus {
  /** Ready to append to the prompt. */
  context: string;
  cardIds: string[];
}

export async function findCardsInFocus(
  message: string,
  history: ChatTurn[],
  access: Access,
  opts: { channelId?: string } = {},
): Promise<CardsInFocus | null> {
  if (!isJevConfigured() || !message.trim()) return null;

  // Channel chat only looks inside its own channel.
  const scope: Access = opts.channelId
    ? { readable: access.readable.filter((id) => id === opts.channelId), writable: access.writable }
    : access;
  if (scope.readable.length === 0) return null;

  // Earlier turns widen the word search too, so a follow-up that only says "it"
  // still has the card from two messages ago on the shortlist.
  const earlier = history.slice(-4);
  const searchText = [message, ...earlier.filter((t) => t.role === 'user').map((t) => t.content)].join(' ');
  const candidates = await cardCandidates(searchText.slice(0, 1000), scope, {});
  if (candidates.length === 0) return null;

  const keys = candidates.map((_, i) => `card_${i + 1}`);
  const questions: Record<string, NoulQuestion> = {};
  const listed: Record<string, unknown> = {};
  keys.forEach((key, i) => {
    listed[key] = candidates[i].detail;
    questions[key] = {
      type: 'noul',
      instructions: `Is \`latest_message\` about \`cards.${key}\` specifically — asking about it, referring to it, or asking to act on it?`,
      criteria: {
        true: 'The message names this card, clearly describes it, or points at it with a word like "it" or "that" that `earlier_messages` ties to this card.',
        false: 'The message is about something else, or about the board in general rather than this card.',
      },
    };
  });

  const result = await askJev(
    {
      latest_message: message.slice(0, 2000),
      earlier_messages: earlier.map((t) => `${t.role === 'user' ? 'User' : 'Kan'}: ${t.content.slice(0, 400)}`),
      cards: listed,
    },
    questions,
    { label: 'cards in focus' },
  );
  if (!result) return null;

  const picked = keys
    .map((key, i) => ({ c: candidates[i], p: result.answers[key]?.noul ?? 0 }))
    .filter((r) => r.p >= MIN_PROBABILITY)
    .sort((a, b) => b.p - a.p)
    .slice(0, MAX_CARDS);

  console.log('[jev-focus]', JSON.stringify({
    candidates: candidates.length,
    picked: picked.map((r) => [r.c.title, Number(r.p.toFixed(3))]),
    ms: result.latencyMs,
  }));
  if (picked.length === 0) return null;

  const ids = picked.map((r) => r.c.id);
  const [rows, cardTasks] = await Promise.all([
    db.query.cards.findMany({ where: inArray(cards.id, ids) }),
    db.query.tasks.findMany({ where: inArray(tasks.cardId, ids), orderBy: [asc(tasks.position)] }),
  ]);

  const sections = picked.flatMap(({ c }) => {
    const row = rows.find((r) => r.id === c.id);
    if (!row) return [];
    const lines = [`### ${row.title} (id:${row.id}) — ${c.where}`];
    if (row.tags?.length) lines.push(`Tags: ${row.tags.join(', ')}`);
    if (row.summary) lines.push(`Summary: ${row.summary}`);
    const thread = ((row.messages || []) as Array<{ type: string; content: string }>).slice(-THREAD_TAIL);
    if (thread.length > 0) {
      const label = (t: string) => (t === 'question' ? 'User' : t === 'ai_response' ? 'Kan' : 'Note');
      lines.push('Thread (newest last):');
      for (const m of thread) lines.push(`[${label(m.type)}] ${(m.content || '').trim().slice(0, MESSAGE_CHARS)}`);
    }
    const mine = cardTasks.filter((t) => t.cardId === row.id);
    if (mine.length > 0) {
      lines.push('Tasks:');
      for (const t of mine) lines.push(`- ${t.title} [${t.status ?? 'not_started'}]`);
    }
    return [lines.join('\n')];
  });
  if (sections.length === 0) return null;

  return {
    cardIds: ids,
    context:
      '[Cards this message is about — picked from the workspace for this turn, with their full content. ' +
      'Answer from these rather than from the one-line summaries above.]\n\n' +
      sections.join('\n\n'),
  };
}

