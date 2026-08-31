import { nanoid } from 'nanoid';
import type { Card, CardMessage, Task } from '@/lib/types';

/**
 * What a duplicated card is.
 *
 * This used to live inline in the menu handler as
 * `createCard({ title, initialMessage: messages[0].content })`, which rebuilt
 * the card from its opening note and threw away the rest — every message a
 * shroom had appended, and every task. Duplicating an enriched card therefore
 * handed you the card as it looked the moment it was first written.
 *
 * The policy is split out here because the interesting part is not the copying,
 * it is the two lists: what carries over, and what must not. A copy that
 * inherited the original's share link, its reactions, or the channels it
 * spawned would not be more faithful — it would be wrong.
 *
 * `makeId` is injected so the result can be asserted on.
 */
export function buildCardDuplicate(
  source: Card,
  sourceTasks: Task[],
  timestamp: string,
  makeId: () => string = nanoid
): { card: Card; tasks: Task[] } {
  // Thread entries are addressed by id, so the copy needs its own.
  const messages: CardMessage[] = (source.messages ?? []).map((m) => ({
    ...m,
    id: makeId(),
    reactions: undefined,
  }));

  const newId = makeId();

  const tasks: Task[] = sourceTasks.map((t) => ({
    ...t,
    id: makeId(),
    cardId: newId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const card: Card = {
    ...source,
    id: newId,
    title: `${source.title} (copy)`,
    messages,
    taskIds: tasks.map((t) => t.id),
    createdAt: timestamp,
    updatedAt: timestamp,

    // --- belongs to the original, not to a copy of it ---
    isPublic: false,
    shareToken: undefined,
    reactions: undefined,
    spawnedChannelIds: undefined,

    // --- transient: would show a false shimmer on a card that isn't building ---
    isProcessing: false,
    processingStatus: undefined,
    reviewRunId: undefined,
  };

  return { card, tasks };
}
