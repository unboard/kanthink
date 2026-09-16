import type { PlaygroundApp } from '@/lib/types'

/**
 * Fold a server response into the app the drawer is already holding.
 *
 * Not every endpoint returns the same shape. GET /api/playground/apps/[appId]
 * assembles a view: the row, plus things computed at request time — the draft token
 * the preview authenticates with, the customer-storage token and its seed, the
 * release list. Every other endpoint returns the row, so those keys are not in its
 * payload at all.
 *
 * Replacing the held app with a row therefore deleted them. Finishing a build left
 * the drawer with no draft token, the preview was rebuilt with an empty one, and
 * window.kanthinkAI rejected every call before it reached the network — which an app
 * that catches around its AI call renders as its fallback content. Nothing had
 * reverted and nothing was lost from the app itself; it had lost permission to make
 * the call. Reopening the drawer re-fetched the token and it worked again, which is
 * why it read as intermittent rather than as a single broken thing.
 *
 * The rule: a key the server sent wins, including one it deliberately set to null.
 * A key it did not send keeps whatever is already known.
 */
export function mergeAppUpdate(
  previous: PlaygroundApp | null,
  next: PlaygroundApp,
): PlaygroundApp {
  if (!previous) return next
  // Spread order does the work: absent keys in `next` fall through to `previous`,
  // present ones — null included — override.
  return { ...previous, ...next }
}

/**
 * Fields the drawer needs that live on the view rather than the row.
 *
 * Listed so the cost of losing one is visible, and so a test can assert they survive
 * an update rather than each being rediscovered the next time one goes missing.
 */
export const SERVER_COMPUTED_APP_FIELDS = [
  'draftToken',
  'draftDataToken',
  'draftCustomer',
  'draftCustomerData',
  'publishedVersion',
  'hasUnpublishedChanges',
  'versions',
] as const
