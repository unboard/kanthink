/**
 * Noteworthy Kanthink updates.
 *
 * The filter is editorial, and deliberately so: an entry earns a place here only if it
 * changes how someone works. The test is whether a user who read nothing else would
 * behave differently tomorrow — a new capability, a new surface, a changed default, a
 * fixed workflow they'd given up on.
 *
 * Do NOT add: visual polish, copy tweaks, refactors, perf work, dependency bumps, or
 * bug fixes in code paths nobody hit. Those are why most changelogs go unread. If
 * you're unsure, leave it out — a short list people trust beats a long one they skim.
 *
 * Newest first. `id` is permanent: the "seen" marker is stored against it, so editing
 * an existing id re-surfaces that entry to everyone.
 */

export type ProductUpdateKind = 'capability' | 'workflow' | 'automation' | 'fix';

export interface ProductUpdate {
  id: string;
  /** ISO date (YYYY-MM-DD) the change reached users. */
  date: string;
  kind: ProductUpdateKind;
  title: string;
  /** One or two sentences: what changed, and what it lets you do now. */
  body: string;
}

export const PRODUCT_UPDATE_KIND_LABELS: Record<ProductUpdateKind, string> = {
  capability: 'New',
  workflow: 'Workflow',
  automation: 'Automation',
  fix: 'Fixed',
};

export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: 'playground-card-tab',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Playground is now a tab on every card',
    body: 'Build a working app against any card without converting it into a playground first — it sits next to Thread, Tasks and Info, with Build/Preview and publish controls in one bar. It reads the card\'s thread and tasks, so requirements you already wrote down get used.',
  },
  {
    id: 'share-destinations-and-notes',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Choose where shares land, and add a note',
    body: 'Sharing a link to Kanthink now lets you pick the channel and column and attach a note about why you saved it. Set a default once and it applies from your phone and your desktop.',
  },
  {
    id: 'sticky-column-sort',
    date: '2026-07-30',
    kind: 'fix',
    title: 'Column sort order sticks',
    body: 'Sorting a column newest-first is now a saved rule rather than a one-time shuffle, so new cards — including shared bookmarks — land where you expect instead of at the bottom.',
  },
  {
    id: 'voice-session-history',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Voice conversations stay up after you stop',
    body: 'Ending an audio session keeps the window open as browsable history, so the cards and drafts it produced are still there to tap through instead of vanishing.',
  },
  {
    id: 'bookmark-shroom-summaries',
    date: '2026-07-24',
    kind: 'automation',
    title: 'Shrooms can work your shared bookmarks',
    body: 'A shroom watching your bookmark inbox now wakes on anything you share to it — summarising the link, tying it into your other channels, and emailing you the digest without you opening the app.',
  },
];

/** The most recent update, or null when the list is empty. */
export function latestProductUpdate(): ProductUpdate | null {
  return PRODUCT_UPDATES[0] ?? null;
}

/**
 * The same list, written for Kan rather than for a panel.
 *
 * Kan is asked "what's new?" in conversation far more often than anyone opens a
 * changelog, so these belong in the prompt. Capped because this rides along on
 * every turn — recent entries are what people mean by "new"; older ones are on
 * the system log page.
 */
export function buildProductUpdateContext(limit = 8): string {
  const entries = PRODUCT_UPDATES.slice(0, limit);
  if (entries.length === 0) return '';

  const lines = entries.map((u) => {
    const label = PRODUCT_UPDATE_KIND_LABELS[u.kind];
    return `- [${u.date}] ${label}: ${u.title} — ${u.body}`;
  });

  return `\n\n## RECENT KANTHINK UPDATES

These are the meaningful changes shipped recently, newest first. You know about these — if the user asks what's new, what changed, what features were added, or whether something they remember is available yet, answer from this list in your own words.

${lines.join('\n')}

Rules:
- Lead with the ones that change what the user can do, not the fixes.
- Summarize conversationally; never read the list verbatim or recite dates unless asked.
- This list is not exhaustive and only covers recent notable changes. If asked about something not here, say you don't have it in your notes rather than guessing — the full history is on the system log page at /system-log.`;
}

/**
 * Updates newer than the last one the user acknowledged.
 *
 * Position-based rather than date-based: an unrecognised id (an entry that was removed,
 * or a marker from a future build) means we can't place the user in the list, so we
 * show nothing as unseen rather than dumping the whole history back on them.
 */
export function unseenProductUpdates(lastSeenId: string | null): ProductUpdate[] {
  if (!lastSeenId) return PRODUCT_UPDATES;
  const index = PRODUCT_UPDATES.findIndex((u) => u.id === lastSeenId);
  if (index === -1) return [];
  return PRODUCT_UPDATES.slice(0, index);
}
