/**
 * Playground thread helpers.
 *
 * The client renders a user's message immediately, before the server confirms it.
 * That optimistic entry goes into the zustand store, and the store's `updateCard`
 * syncs every change to the server — so an optimistic *render* was also a *write*.
 * The generate route then read that thread and appended its own copy of the same
 * message, which is why user messages rendered twice while Kan's rendered once.
 *
 * The server owns the canonical thread. Client placeholders never belong in it.
 */

/** Prefix the client uses for messages not yet confirmed. Must match PlaygroundView. */
export const OPTIMISTIC_ID_PREFIX = '__optimistic_';

export function isOptimisticId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/**
 * Drop client-side placeholder messages from a persisted thread.
 *
 * Also repairs threads that already contain duplicates: any stored optimistic entry
 * is removed the next time the card is generated on, so existing damage heals rather
 * than needing a migration.
 */
export function stripOptimistic<T extends { id?: unknown }>(messages: unknown): T[] {
  if (!Array.isArray(messages)) return [];
  return (messages as T[]).filter(m => !isOptimisticId(m?.id));
}
